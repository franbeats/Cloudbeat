// 1. INICIALIZACIÓN DEL CONTEXTO Y ENRUTAMIENTO DE AUDIO NATIVO
let audioCtx;

const decks = {
    A: { audio: null, source: null, gainNode: null, filters: {}, isPlaying: false, url: '' },
    B: { audio: null, source: null, gainNode: null, filters: {}, isPlaying: false, url: '' }
};

let crossfaderNode;

function initAudio() {
    if (audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    crossfaderNode = audioCtx.createGain();
    crossfaderNode.connect(audioCtx.destination);

    // Inicializamos la estructura de nodos base para cada Deck (sin asociar URLs vacías)
    initDeckNode('A');
    initDeckNode('B');
    updateCrossfader(0);
}

function initDeckNode(id) {
    const deck = decks[id];
    
    deck.audio = new Audio();
    deck.audio.crossOrigin = "anonymous";
    deck.audio.loop = true;

    setupDeckTimeline(id);

    deck.source = audioCtx.createMediaElementSource(deck.audio);
    deck.gainNode = audioCtx.createGain();

    // CREACIÓN DE NODOS DE FILTRO PARA LA ECUALIZACIÓN (3 BANDAS PIONEER)
    deck.filters.high = audioCtx.createBiquadFilter();
    deck.filters.high.type = 'highshelf';
    deck.filters.high.frequency.setValueAtTime(3000, audioCtx.currentTime);

    deck.filters.mid = audioCtx.createBiquadFilter();
    deck.filters.mid.type = 'peaking';
    deck.filters.mid.Q.setValueAtTime(1, audioCtx.currentTime);
    deck.filters.mid.frequency.setValueAtTime(1000, audioCtx.currentTime);

    deck.filters.low = audioCtx.createBiquadFilter();
    deck.filters.low.type = 'lowshelf';
    deck.filters.low.frequency.setValueAtTime(300, audioCtx.currentTime);

    deck.source.connect(deck.filters.high);
    deck.filters.high.connect(deck.filters.mid);
    deck.filters.mid.connect(deck.filters.low);
    deck.filters.low.connect(deck.gainNode);
    deck.gainNode.connect(crossfaderNode);
}


// 2. LÓGICA DE CONTROL OPERATIVO DE HARDWARE (PLAY / PAUSE / CUE CON GIRO)
function togglePlay(id) {
    initAudio();
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const deck = decks[id];
    const jog = document.getElementById(`jog-${id.toLowerCase()}`);

    if (!deck.url) {
        alert(`¡El Deck ${id} no tiene ninguna pista cargada! Selecciona una desde el catálogo CloudBeat 🎵`);
        return;
    }

    if (!deck.isPlaying) {
        // Envolver en promesa segura para prevenir interrupciones en Safari
        const playPromise = deck.audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                deck.isPlaying = true;
                if (jog) {
                    jog.classList.add('spinning');
                    jog.style.animation = "rotateJog 2s linear infinite";
                }
            }).catch(error => {
                console.error("Safari bloqueó o pausó la reproducción multimedia:", error);
            });
        }
    } else {
        deck.audio.pause();
        deck.isPlaying = false;

        if (jog) {
            jog.classList.remove('spinning');
            jog.style.animation = "none";
        }
    }
}

function resetCue(id) {
    const deck = decks[id];
    const jog = document.getElementById(`jog-${id.toLowerCase()}`);

    if (deck.audio && deck.url) {
        deck.audio.currentTime = 0;
        if (!deck.isPlaying) {
            if (jog) {
                jog.classList.remove('spinning');
                jog.style.animation = "none";
            }
        }
    }
}

function updateCrossfader(value) {
    if (!crossfaderNode) return;
    const x = parseFloat(value);
    const gainA = Math.cos(((x + 1) * Math.PI) / 4);
    const gainB = Math.sin(((x + 1) * Math.PI) / 4);

    if (decks['A'].gainNode) decks['A'].gainNode.gain.setValueAtTime(gainA, audioCtx.currentTime);
    if (decks['B'].gainNode) decks['B'].gainNode.gain.setValueAtTime(gainB, audioCtx.currentTime);
}


// 3. NAVEGACIÓN Y BEND DE VINILO (JOG WHEEL TOUCH INTERACTION)
function setupJogWheelInteraction(id) {
    const jog = document.getElementById(`jog-${id.toLowerCase()}`);
    if (!jog) return;

    let isDragging = false;
    let startX = 0;

    jog.style.cursor = 'grab';

    jog.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        jog.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deck = decks[id];
        if (deck && deck.audio && !isNaN(deck.audio.duration) && deck.url) {
            const deltaX = e.clientX - startX;
            deck.audio.currentTime = Math.max(0, Math.min(deck.audio.duration, deck.audio.currentTime + (deltaX * 0.05)));
        }

        startX = e.clientX;
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            jog.style.cursor = 'grab';
        }
    });
}

// 4. CONTROL DE LA LINEA DE TIEMPO Y PROGRESO DE LOS DECKS
function setupDeckTimeline(id) {
    const deck = decks[id];
    if (!deck || !deck.audio) return;

    deck.audio.addEventListener('timeupdate', () => {
        const progressEl = document.getElementById(`progress-${id.toLowerCase()}`);
        if (!progressEl) return;

        if (deck.audio.duration && !isNaN(deck.audio.duration)) {
            const porcentaje = (deck.audio.currentTime / deck.audio.duration) * 100;
            progressEl.style.width = `${porcentaje}%`;
        } else {
            progressEl.style.width = '0%';
        }
    });
}

function seekTrack(id, event) {
    const deck = decks[id];
    if (!deck || !deck.url || !deck.audio.duration || isNaN(deck.audio.duration)) return;

    const timeline = event.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const porcentaje = clickX / width;

    deck.audio.currentTime = porcentaje * deck.audio.duration;
}

// 5. CONTROL DE PITCH FADER VERTICAL (PASO CONTINUO DE 0.1% HASTA 20%)
function cambiarPitch(id, valor) {
    const deck = decks[id];
    if (!deck || !deck.audio) return;

    const valNum = parseFloat(valor);
    const playbackRate = 1.0 + valNum;
    deck.audio.playbackRate = playbackRate;

    const porcentajeNum = valNum * 100;
    const porcentajeTxt = porcentajeNum.toFixed(1);
    
    const spanVal = document.getElementById(`pitch-val-${id.toLowerCase()}`);
    if (spanVal) {
        if (porcentajeNum > 0) {
            spanVal.innerText = `+${porcentajeTxt}%`;
        } else {
            spanVal.innerText = `${porcentajeTxt}%`;
        }
    }
}


// 6. EFECTO VISUAL FEEDBACK (CAMBIO DE COLOR SOLO AL DAR CLICK)
function setupPressColorEffect(elementId, activeColor) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const originalBg = el.style.backgroundColor;
    const originalBorder = el.style.borderColor;
    const originalBoxShadow = el.style.boxShadow;

    const activarEfecto = () => {
        el.style.backgroundColor = activeColor.bg || activeColor;
        if (activeColor.border) el.style.borderColor = activeColor.border;
        if (activeColor.shadow) el.style.boxShadow = activeColor.shadow;
    };

    const desactivarEfecto = () => {
        el.style.backgroundColor = originalBg;
        el.style.borderColor = originalBorder;
        el.style.boxShadow = originalBoxShadow;
    };

    el.addEventListener('mousedown', activarEfecto);
    el.addEventListener('mouseup', desactivarEfecto);
    el.addEventListener('mouseleave', desactivarEfecto);

    el.addEventListener('touchstart', activarEfecto);
    el.addEventListener('touchend', desactivarEfecto);
}

// 7. CAPTURA DE EVENTOS DEL DOM
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('play-a').addEventListener('click', () => togglePlay('A'));
    document.getElementById('play-b').addEventListener('click', () => togglePlay('B'));
    document.getElementById('cue-a').addEventListener('click', () => resetCue('A'));
    document.getElementById('cue-b').addEventListener('click', () => resetCue('B'));

    setupJogWheelInteraction('A');
    setupJogWheelInteraction('B');

    setupPressColorEffect('cue-a', { bg: '#ff5500', border: '#ff8800', shadow: '0 0 15px #ff5500' });
    setupPressColorEffect('cue-b', { bg: '#ff5500', border: '#ff8800', shadow: '0 0 15px #ff5500' });

    setupPressColorEffect('play-a', { bg: '#10b981', border: '#34d399', shadow: '0 0 15px #10b981' });
    setupPressColorEffect('play-b', { bg: '#10b981', border: '#34d399', shadow: '0 0 15px #10b981' });

    setupPressColorEffect('jog-a', { bg: '#0284c7', border: '#38bdf8', shadow: '0 0 25px #0284c7' });
    setupPressColorEffect('jog-b', { bg: '#0284c7', border: '#38bdf8', shadow: '0 0 25px #0284c7' });

    document.getElementById('vol-a').addEventListener('input', (e) => {
        if (decks['A'].gainNode && audioCtx) decks['A'].gainNode.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });
    document.getElementById('vol-b').addEventListener('input', (e) => {
        if (decks['B'].gainNode && audioCtx) decks['B'].gainNode.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });

    document.getElementById('crossfader').addEventListener('input', (e) => {
        updateCrossfader(e.target.value);
    });

    // CANAL A
    document.getElementById('hi-a').addEventListener('input', (e) => {
        if (decks['A'].filters.high && audioCtx) decks['A'].filters.high.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });
    document.getElementById('mid-a').addEventListener('input', (e) => {
        if (decks['A'].filters.mid && audioCtx) decks['A'].filters.mid.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });
    document.getElementById('low-a').addEventListener('input', (e) => {
        if (decks['A'].filters.low && audioCtx) decks['A'].filters.low.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });

    // CANAL B
    document.getElementById('hi-b').addEventListener('input', (e) => {
        if (decks['B'].filters.high && audioCtx) decks['B'].filters.high.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });
    document.getElementById('mid-b').addEventListener('input', (e) => {
        if (decks['B'].filters.mid && audioCtx) decks['B'].filters.mid.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });
    document.getElementById('low-b').addEventListener('input', (e) => {
        if (decks['B'].filters.low && audioCtx) decks['B'].filters.low.gain.setValueAtTime(e.target.value, audioCtx.currentTime);
    });
});

// 8. CARGA DE PISTAS EN LOS DECKS
function cargarPistaEnDeck(idDeck, urlAudio, titulo) {
    initAudio();

    const deck = decks[idDeck];
    if (!deck) return;

    if (deck.isPlaying) {
        deck.audio.pause();
        deck.isPlaying = false;

        const jog = document.getElementById(`jog-${idDeck.toLowerCase()}`);
        if (jog) {
            jog.classList.remove('spinning');
            jog.style.animation = 'none';
        }
    }

    deck.url = urlAudio;
    deck.audio.src = urlAudio;
    deck.audio.load(); // Forzar precarga para Safari

    const progressEl = document.getElementById(`progress-${idDeck.toLowerCase()}`);
    if (progressEl) {
        progressEl.style.background = 'var(--neon-blue)';
        progressEl.style.boxShadow = '0 0 10px var(--neon-blue)';
    }

    console.log(`Pista "${titulo}" cargada correctamente en el Deck ${idDeck}.`);
    
    // Notificacion flotante (Toast) en lugar de alert() para no congelar el audio en Safari
    mostrarNotificacionFlotante(`¡Pista "${titulo}" cargada con éxito en el DECK ${idDeck}! 🎧`);
}

// Función auxiliar para mostrar un aviso flotante sin bloquear el navegador
function mostrarNotificacionFlotante(mensaje) {
    let toast = document.getElementById('cloudbeat-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cloudbeat-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            background: #131722;
            color: #48deff;
            border: 2px solid #48deff;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: bold;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
            z-index: 9999;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(toast);
    }
    
    toast.innerText = mensaje;
    toast.style.opacity = '1';

    // Ocultar automáticamente después de 3 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

// Función global auxiliar por si se requiere frenar todo el audio al cerrar sesión
function pausarTodoAudio() {
    ['A', 'B'].forEach(id => {
        if (decks[id].audio) {
            decks[id].audio.pause();
            decks[id].audio.currentTime = 0;
            decks[id].isPlaying = false;
        }
    });
}
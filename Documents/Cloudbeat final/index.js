const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const pool = require('./db'); // Conexión a Supabase/PostgreSQL

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARES GENERALES (¡DEBEN IR ANTES DE LAS RUTAS!)
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos de la interfaz
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// IMPORTACIÓN DE RUTAS DEL BACKEND
// ==========================================
const authRoutes = require('./routes/auth');
const cancionesRoutes = require('./routes/canciones');
const playlistsRoutes = require('./routes/playlists');
const historialRoutes = require('./routes/historial'); // <-- Importado aquí ordenadamente

// Registrar las rutas en la API
app.use('/api/auth', authRoutes);
app.use('/api/canciones', cancionesRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/historial', historialRoutes); // <-- Registrado aquí con acceso a express.json()

// Ruta principal para asegurar la carga de la interfaz de la cabina DJ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`Servidor de CloudBeat corriendo exitosamente en el puerto ${PORT}`);
});
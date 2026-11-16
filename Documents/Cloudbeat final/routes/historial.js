const express = require('express');
const router = express.Router();
const pool = require('../db');

// RUTA: Obtener el historial de sesiones (Profesor ve todo / Alumno ve lo suyo)
router.get('/', async (req, res) => {
    const { usuario_id, rol_id } = req.query;
    let client;

    try {
        client = await pool.connect();
        
        if (parseInt(rol_id) === 1) {
            // PROFESOR: Trae el acumulado por alumno y sus datos
            const query = `
                SELECT 
                    u.id as usuario_id, 
                    u.email, 
                    COALESCE(p.horas_entrenamiento, 0) as horas_entrenamiento,
                    p.feedback_profesor,
                    p.calificacion
                FROM usuarios u
                LEFT JOIN perfiles p ON u.id = p.usuario_id
                WHERE u.rol_id = 2
                ORDER BY u.id ASC
            `;
            const resultado = await client.query(query);
            return res.json(resultado.rows);
        } else {
            // ALUMNO: Trae sus datos acumulados
            const queryPerfil = `
                SELECT 
                    u.id as usuario_id,
                    u.email,
                    COALESCE(p.horas_entrenamiento, 0) as horas_entrenamiento,
                    p.feedback_profesor,
                    p.calificacion
                FROM usuarios u
                LEFT JOIN perfiles p ON u.id = p.usuario_id
                WHERE u.id = $1
            `;
            const resPerfil = await client.query(queryPerfil, [usuario_id]);
            return res.json(resPerfil.rows);
        }
    } catch (error) {
        console.error("Error al obtener historial:", error.message);
        res.status(500).json({ status: "error", message: "Error interno al consultar historial." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Registrar una NUEVA SESIÓN y actualizar total en perfiles
router.post('/sumar-horas', async (req, res) => {
    const { usuario_id, horas } = req.body;
    let client;

    // permitimos valores numéricos válidos (incluso si es 0 o decimales)
    if (!usuario_id || horas === undefined || horas === null) {
        return res.status(400).json({ status: "error", message: "Faltan datos de usuario u horas." });
    }

    const horasNumericas = parseFloat(horas);

    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Transacción segura

        // 1. Insertar el registro de la sesión en historial_sesiones
        const insertQuery = `
            INSERT INTO historial_sesiones (usuario_id, horas_entrenamiento, feedback_profesor, calificacion)
            VALUES ($1, $2, 'Sesión de práctica registrada', NULL)
            RETURNING id;
        `;
        await client.query(insertQuery, [usuario_id, horasNumericas]);

        // 2. Acumular las horas en la tabla perfiles
        const updatePerfilQuery = `
            UPDATE perfiles 
            SET horas_entrenamiento = COALESCE(horas_entrenamiento, 0) + $1
            WHERE usuario_id = $2;
        `;
        await client.query(updatePerfilQuery, [horasNumericas, usuario_id]);

        await client.query('COMMIT');
        res.status(200).json({ status: "success", message: "Sesión e historial registrados con éxito." });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error("Error al registrar sesión en historial:", error.message);
        res.status(500).json({ status: "error", message: "Error interno al guardar sesión: " + error.message });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Evaluar alumno (Profesor actualiza feedback y nota)
router.put('/evaluar/:usuarioId', async (req, res) => {
    const { usuarioId } = req.params;
    const { feedback_profesor, calificacion } = req.body;

    try {
        // upsert para que si no existe la fila en historial_sesiones, la cree automáticamente
        const { error } = await supabase
            .from('historial_sesiones')
            .upsert({ 
                usuario_id: parseInt(usuarioId), 
                feedback_profesor, 
                calificacion 
            }, { onConflict: 'usuario_id' }); // 'usuario_id' debe ser llave única en la tabla

        if (error) throw error;

        res.json({ success: true, message: 'Evaluación guardada correctamente' });
    } catch (err) {
        console.error("Error al evaluar:", err);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

module.exports = router;

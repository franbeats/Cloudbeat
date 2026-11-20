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

    if (!usuario_id || horas === undefined || horas === null) {
        return res.status(400).json({ status: "error", message: "Faltan datos de usuario u horas." });
    }

    const horasNumericas = parseFloat(horas);

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO historial_sesiones (usuario_id, horas_entrenamiento, feedback_profesor, calificacion)
            VALUES ($1, $2, 'Sesión de práctica registrada', NULL)
            RETURNING id;
        `;
        await client.query(insertQuery, [usuario_id, horasNumericas]);

        const updatePerfilQuery = `
            UPDATE perfiles 
            SET horas_entrenamiento = COALESCE(horas_entrenamiento, 0) + $1
            WHERE usuario_id = $2;
        `;
        const resUpdate = await client.query(updatePerfilQuery, [horasNumericas, usuario_id]);

        if (resUpdate.rowCount === 0) {
            await client.query(
                `INSERT INTO perfiles (usuario_id, horas_entrenamiento) VALUES ($1, $2);`,
                [usuario_id, horasNumericas]
            );
        }

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

// RUTA: Evaluar alumno (Profesor actualiza feedback y nota en perfiles)
router.put('/evaluar/:usuarioId', async (req, res) => {
    const { usuarioId } = req.params;
    const { feedback_profesor, calificacion } = req.body;
    let client;

    const notaNumerica = calificacion === '' || calificacion === undefined || calificacion === null
        ? null
        : parseFloat(calificacion);

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const updatePerfil = await client.query(
            `UPDATE perfiles
             SET feedback_profesor = $1, calificacion = $2
             WHERE usuario_id = $3
             RETURNING *;`,
            [feedback_profesor, notaNumerica, parseInt(usuarioId)]
        );

        if (updatePerfil.rowCount === 0) {
            await client.query(
                `INSERT INTO perfiles (usuario_id, horas_entrenamiento, feedback_profesor, calificacion)
                 VALUES ($1, 0, $2, $3);`,
                [parseInt(usuarioId), feedback_profesor, notaNumerica]
            );
        }

        await client.query(
            `UPDATE historial_sesiones
             SET feedback_profesor = $1, calificacion = $2
             WHERE id = (
                 SELECT id FROM historial_sesiones
                 WHERE usuario_id = $3
                 ORDER BY id DESC
                 LIMIT 1
             );`,
            [feedback_profesor, notaNumerica, parseInt(usuarioId)]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Evaluación guardada correctamente' });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("Error al evaluar:", err.message);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;

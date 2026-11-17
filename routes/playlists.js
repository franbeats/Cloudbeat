const express = require('express');
const router = express.Router();
const pool = require('../db');

// RUTA: Obtener playlists (todas o filtradas por usuario_id)
router.get('/', async (req, res) => {
    const { usuario_id } = req.query;
    let client;

    try {
        client = await pool.connect();
        let query = 'SELECT * FROM playlists';
        let values = [];

        if (usuario_id) {
            query += ' WHERE usuario_id = $1';
            values.push(usuario_id);
        }

        const resultado = await client.query(query, values);
        res.status(200).json(resultado.rows);

    } catch (error) {
        console.error("Error al obtener playlists:", error.message);
        res.status(500).json({ status: "error", message: "Error interno del servidor al obtener las playlists." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Crear una nueva playlist para un usuario[cite: 6]
router.post('/', async (req, res) => {
    const { nombre_playlist, usuario_id } = req.body;
    let client;

    if (!nombre_playlist || !usuario_id) {
        return res.status(400).json({ status: "error", message: "El nombre de la playlist y el usuario ID son obligatorios." });
    }

    try {
        client = await pool.connect();
        
        const playlistResult = await client.query(
            'INSERT INTO playlists (nombre_playlist, usuario_id) VALUES ($1, $2) RETURNING id, nombre_playlist, usuario_id;',
            [nombre_playlist, usuario_id]
        );
        
        const nuevaPlaylist = playlistResult.rows[0];

        res.status(201).json({
            status: "success",
            message: "¡Playlist creada con éxito!",
            playlist: nuevaPlaylist
        });

    } catch (error) {
        console.error("Error al crear playlist:", error.message);
        res.status(500).json({ status: "error", message: "Error interno del servidor al crear la playlist." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Actualizar nombre de una playlist (PUT)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_playlist } = req.body;
    let client;

    if (!nombre_playlist) {
        return res.status(400).json({ status: "error", message: "El nuevo nombre de la playlist es obligatorio." });
    }

    try {
        client = await pool.connect();
        const resultado = await client.query(
            'UPDATE playlists SET nombre_playlist = $1 WHERE id = $2 RETURNING *;',
            [nombre_playlist, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ status: "error", message: "Playlist no encontrada." });
        }

        res.status(200).json({
            status: "success",
            message: "¡Playlist renombrada con éxito!",
            playlist: resultado.rows[0]
        });

    } catch (error) {
        console.error("Error al actualizar playlist:", error.message);
        res.status(500).json({ status: "error", message: "Error interno al actualizar la playlist." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Eliminar una playlist completa (DELETE)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    let client;

    try {
        client = await pool.connect();
        
        // 1. Eliminar primero las relaciones de canciones en la tabla intermedia
        await client.query('DELETE FROM playlist_canciones WHERE playlist_id = $1;', [id]);
        
        // 2. Eliminar la playlist
        const resultado = await client.query('DELETE FROM playlists WHERE id = $1 RETURNING *;', [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ status: "error", message: "Playlist no encontrada." });
        }

        res.status(200).json({
            status: "success",
            message: "¡Playlist eliminada con éxito!"
        });

    } catch (error) {
        console.error("Error al eliminar playlist:", error.message);
        res.status(500).json({ status: "error", message: "Error interno al eliminar la playlist." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Agregar una canción a una playlist (Tabla intermedia N:M)[cite: 6]
router.post('/agregar-cancion', async (req, res) => {
    const { playlist_id, cancion_id } = req.body;
    let client;

    if (!playlist_id || !cancion_id) {
        return res.status(400).json({ status: "error", message: "playlist_id y cancion_id son obligatorios." });
    }

    try {
        client = await pool.connect();
        
        await client.query(
            'INSERT INTO playlist_canciones (playlist_id, cancion_id) VALUES ($1, $2);',
            [playlist_id, cancion_id]
        );

        res.status(201).json({
            status: "success",
            message: "¡Canción agregada a la playlist con éxito!"
        });

    } catch (error) {
        console.error("Error al asociar canción:", error.message);
        
        if (error.code === '23505') {
            return res.status(409).json({ status: "error", message: "Esta canción ya se encuentra agregada en la playlist." });
        }

        res.status(500).json({ status: "error", message: "Error interno del servidor al asociar la canción." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Quitar una canción de una playlist mediante parámetros en la URL (DELETE)
router.delete('/:playlistId/canciones/:cancionId', async (req, res) => {
    const { playlistId, cancionId } = req.params;
    let client;

    try {
        client = await pool.connect();
        
        await client.query(
            'DELETE FROM playlist_canciones WHERE playlist_id = $1 AND cancion_id = $2;',
            [playlistId, cancionId]
        );

        res.status(200).json({
            status: "success",
            message: "¡Canción retirada de la playlist con éxito!"
        });

    } catch (error) {
        console.error("Error al quitar canción de la playlist:", error.message);
        res.status(500).json({ status: "error", message: "Error interno al quitar la canción." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Obtener las canciones de una playlist específica
router.get('/:id/canciones', async (req, res) => {
    const playlistId = req.params.id;
    let client;

    try {
        client = await pool.connect();
        const query = `
            SELECT c.* FROM canciones c
            JOIN playlist_canciones pc ON c.id = pc.cancion_id
            WHERE pc.playlist_id = $1
        `;
        const resultado = await client.query(query, [playlistId]);
        res.status(200).json(resultado.rows);
    } catch (error) {
        console.error("Error al obtener canciones de la playlist:", error.message);
        res.status(500).json({ status: "error", message: "Error al obtener canciones de la playlist." });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
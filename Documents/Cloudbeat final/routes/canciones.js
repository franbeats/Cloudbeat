const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// 1. OBTENER TODAS LAS CANCIONES (GET)
router.get('/', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM canciones ORDER BY id DESC;');
        client.release();
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ status: "error", message: "Error al obtener el catálogo de canciones." });
    }
});


// 2. SUBIR NUEVA CANCIÓN (POST)
router.post('/subir', upload.single('audio'), async (req, res) => {
    const { titulo, artista, bpm, genero_id, usuario_id } = req.body;
    const archivo = req.file;

    if (!titulo || !artista || !bpm || !genero_id || !archivo) {
        return res.status(400).json({ status: "error", message: "Todos los campos y el archivo MP3 son obligatorios." });
    }

    let client;
    try {
        client = await pool.connect();

        const subirACloudinary = () => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "cloudbeat_tracks"
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(archivo.buffer);
            });
        };

        const resultadoCloudinary = await subirACloudinary();
        const urlAudioNube = resultadoCloudinary.secure_url;

        const queryInsert = `
            INSERT INTO canciones (titulo, artista, bpm, genero_id, url_audio, duracion) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        const values = [titulo, artista, parseInt(bpm), parseInt(genero_id), urlAudioNube, '03:45'];
        const dbResult = await client.query(queryInsert, values);

        res.status(201).json({
            status: "success",
            message: "¡Canción subida a Cloudinary y registrada con éxito!",
            cancion: dbResult.rows[0]
        });

    } catch (error) {
        console.error("Error al subir archivo a Cloudinary:", error.message);
        res.status(500).json({ status: "error", message: "Error interno al procesar el archivo multimedia: " + error.message });
    } finally {
        if (client) client.release();
    }
});


// 3. MODIFICAR / ACTUALIZAR CANCIÓN (PUT) 
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { titulo, artista, bpm } = req.body;

    let client;
    try {
        client = await pool.connect();
        const queryUpdate = `
            UPDATE canciones 
            SET titulo = $1, artista = $2, bpm = $3 
            WHERE id = $4 
            RETURNING *;
        `;
        const values = [titulo, artista, parseInt(bpm), id];
        const dbResult = await client.query(queryUpdate, values);

        if (dbResult.rows.length === 0) {
            return res.status(404).json({ status: "error", message: "Canción no encontrada." });
        }

        res.json({
            status: "success",
            message: "¡Pista actualizada correctamente!",
            cancion: dbResult.rows[0]
        });

    } catch (error) {
        console.error("Error al actualizar la canción:", error.message);
        res.status(500).json({ status: "error", message: "Error al actualizar la canción en la base de datos." });
    } finally {
        if (client) client.release();
    }
});


// 4. ELIMINAR CANCIÓN (DELETE) 
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    let client;
    try {
        client = await pool.connect();
        
        // Primero eliminamos la referencia en la tabla intermedia de playlists ojo evitar errores de llave foránea
        await client.query('DELETE FROM playlist_canciones WHERE cancion_id = $1;', [id]);
        
        // Luego eliminamos la canción del catálogo global
        const dbResult = await client.query('DELETE FROM canciones WHERE id = $1 RETURNING *;', [id]);

        if (dbResult.rows.length === 0) {
            return res.status(404).json({ status: "error", message: "Canción no encontrada." });
        }

        res.json({
            status: "success",
            message: "¡Pista eliminada correctamente del sistema!"
        });

    } catch (error) {
        console.error("Error al eliminar la canción:", error.message);
        res.status(500).json({ status: "error", message: "Error al eliminar la canción." });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
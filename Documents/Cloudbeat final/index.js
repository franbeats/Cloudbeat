const express = require('express');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;


// Ruta de prueba base
app.get('/test-db', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM roles;');
        res.json({
            status: "success",
            message: "¡Servidor Node.js conectado con éxito a Supabase!",
            data: result.rows
        });
    } catch (error) {
        console.error("Error detectado:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    } finally {
        if (client) client.release();
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
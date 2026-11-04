const express = require('express');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
        if (client) client.release(); // Libera el slot del pooler inmediatamente
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});




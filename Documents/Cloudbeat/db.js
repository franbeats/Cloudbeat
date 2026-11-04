const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
    max: 1, // Obliga a usar una sola conexión rápida
    connectionTimeoutMillis: 5000 // Si no conecta en 5 segundos, aborta y te avisa
});

module.exports = pool;


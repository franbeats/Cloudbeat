const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');

// RUTA: Registro de usuarios (Seguro con creación automática de perfil)
router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    let client;

    if (!email || !password) {
        return res.status(400).json({ status: "error", message: "Email y contraseña son obligatorios." });
    }

    try {
        client = await pool.connect();

        // 1. Verificar si el email ya existe
        const userCheck = await client.query('SELECT id FROM usuarios WHERE email = $1;', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ status: "error", message: "El correo electrónico ya está registrado." });
        }

        // 2. Encriptar contraseña
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 3. SEGURIDAD: Por defecto todo registro público entra con rol 2 (Alumno/DJ)
        const rol_id = 2;

        // 4. Iniciar transacción para insertar usuario y crear su perfil en 0 horas
        await client.query('BEGIN');

        const result = await client.query(
            'INSERT INTO usuarios (email, password, rol_id) VALUES ($1, $2, $3) RETURNING id, email, rol_id;',
            [email, passwordHash, rol_id]
        );

        const nuevoUsuario = result.rows[0];

        // 5. Crear registro inicial en perfiles para habilitar el cronómetro de horas
        const nombreBase = email.split('@')[0];
        await client.query(
            'INSERT INTO perfiles (nombre, apellido, usuario_id, horas_entrenamiento) VALUES ($1, $2, $3, $4);',
            [nombreBase, 'Alumno', nuevoUsuario.id, 0]
        );

        await client.query('COMMIT');

        res.status(201).json({
            status: "success",
            message: "¡Usuario registrado con éxito como Alumno/DJ!",
            data: nuevoUsuario
        });

    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error("Error al revertir transacción:", rollbackError.message);
            }
        }
        console.error("Error en registro:", error.message);
        res.status(500).json({ status: "error", message: "Error interno al registrar usuario." });
    } finally {
        if (client) client.release();
    }
});

// RUTA: Inicio de Sesión
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    let client;

    if (!email || !password) {
        return res.status(400).json({ status: "error", message: "Email y contraseña son obligatorios." });
    }

    try {
        client = await pool.connect();

        // Buscar usuario
        const result = await client.query('SELECT * FROM usuarios WHERE email = $1;', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ status: "error", message: "Credenciales inválidas." });
        }

        const usuario = result.rows[0];

        // Validar contraseña hash
        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ status: "error", message: "Credenciales inválidas." });
        }

        res.json({
            status: "success",
            message: "¡Inicio de sesión exitoso!",
            usuario: {
                id: usuario.id,
                email: usuario.email,
                rol_id: usuario.rol_id
            }
        });

    } catch (error) {
        console.error("Error en login:", error.message);
        res.status(500).json({ status: "error", message: "Error interno del servidor." });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
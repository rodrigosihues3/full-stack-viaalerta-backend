import bcrypt from 'bcryptjs';
import * as otplib from 'otplib';
import qrcode from 'qrcode';
import { pool } from '../config/db.js';
import { firmarToken } from '../utils/jwt.js';

const crearError = (mensaje, statusCode = 400) => {
    const error = new Error(mensaje);
    error.statusCode = statusCode;
    return error;
};

export const registrarCiudadano = async ({ dni, email, password, nombres, apellidos }) => {
    if (!dni || !email || !password || !nombres || !apellidos) {
        throw crearError('Todos los campos son obligatorios', 400);
    }

    const dniRegex = /^[0-9]{8}$/;
    if (!dniRegex.test(dni)) {
        throw crearError('El DNI debe contener exactamente 8 dígitos numéricos', 400);
    }

    const { rows: duplicados } = await pool.query(
        'SELECT id FROM usuarios WHERE email = $1 OR dni = $2',
        [email.trim().toLowerCase(), dni]
    );

    if (duplicados.length > 0) {
        throw crearError('El correo o DNI ya se encuentra registrado', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows: nuevosUsuarios } = await pool.query(
        `INSERT INTO usuarios (dni, email, password_hash, nombres, apellidos, rol)
         VALUES ($1, $2, $3, $4, $5, 'CIUDADANO')
         RETURNING id, entidad_id, rol, dni, email, nombres, apellidos, dos_pasos_activo, activo, creado_en, actualizado_en`,
        [dni, email.trim().toLowerCase(), passwordHash, nombres.trim(), apellidos.trim()]
    );

    return nuevosUsuarios[0];
};

export const iniciarSesion = async ({ email, password }) => {
    if (!email || !password) {
        throw crearError('Correo y contraseña son requeridos', 400);
    }

    const identificador = email.trim().toLowerCase();
    const { rows } = await pool.query(
        `SELECT id, entidad_id, rol, dni, email, password_hash, nombres, apellidos, dos_pasos_activo, activo 
         FROM usuarios 
         WHERE LOWER(email) = $1 OR dni = $2`,
        [identificador, email.trim()]
    );

    const usuario = rows[0];

    if (!usuario || !usuario.activo) {
        throw crearError('Correo o contraseña incorrectos', 401);
    }

    const passwordCoincide = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordCoincide) {
        throw crearError('Correo o contraseña incorrectos', 401);
    }

    if (usuario.dos_pasos_activo === true) {
        return {
            requiere2FA: true,
            tokenTemporal: firmarToken(
                {
                    sub: usuario.id,
                    email: usuario.email,
                    rol: usuario.rol,
                    etapa: 'pendiente-2fa'
                },
                '5m'
            )
        };
    }

    return {
        tokenAcceso: firmarToken(
            {
                sub: usuario.id,
                email: usuario.email,
                rol: usuario.rol,
                entidad_id: usuario.entidad_id,
                etapa: 'completa'
            },
            '8h'
        ),
        user: {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol,
            nombres: usuario.nombres,
            apellidos: usuario.apellidos,
            entidad_id: usuario.entidad_id,
            dos_pasos_activo: false
        }
    };
};

export const configurar2FA = async (usuarioId) => {
    const { rows } = await pool.query(
        'SELECT id, email, dos_pasos_activo FROM usuarios WHERE id = $1',
        [usuarioId]
    );

    const usuario = rows[0];
    if (!usuario) {
        throw crearError('Usuario no encontrado', 404);
    }

    if (usuario.dos_pasos_activo === true) {
        throw crearError('El 2FA ya está activo en esta cuenta', 409);
    }

    const secreto = otplib.generateSecret();
    const uri = `otpauth://totp/ViaAlerta:${usuario.email}?secret=${secreto}&issuer=ViaAlerta`;
    const qr = await qrcode.toDataURL(uri);

    await pool.query(
        'UPDATE usuarios SET secreto_2fa_pendiente = $1 WHERE id = $2',
        [secreto, usuarioId]
    );

    return {
        mensaje: 'Escanea el QR y confirma con un código',
        secreto,
        uri,
        qr
    };
};

export const activar2FA = async (usuarioId, codigo) => {
    const { rows } = await pool.query(
        'SELECT id, secreto_2fa_pendiente, dos_pasos_activo FROM usuarios WHERE id = $1',
        [usuarioId]
    );

    const usuario = rows[0];
    if (!usuario) {
        throw crearError('Usuario no encontrado', 404);
    }

    if (!usuario.secreto_2fa_pendiente) {
        throw crearError('Primero debe solicitar la configuración de 2FA', 400);
    }

    let esValido = false;
    try {
        const resultado = await otplib.verify({
            secret: usuario.secreto_2fa_pendiente,
            token: String(codigo).trim(),
            epochTolerance: 30
        });
        esValido = Boolean(resultado && (resultado === true || resultado.valid === true));
    } catch {
        esValido = false;
    }

    if (!esValido) {
        throw crearError('Código incorrecto. El 2FA sigue desactivado', 400);
    }

    await pool.query(
        `UPDATE usuarios 
         SET secreto_2fa = secreto_2fa_pendiente,
             secreto_2fa_pendiente = NULL,
             dos_pasos_activo = TRUE 
         WHERE id = $1`,
        [usuarioId]
    );

    return { mensaje: '2FA activado exitosamente' };
};

export const verificar2FA = async (usuarioId, codigo) => {
    const { rows } = await pool.query(
        `SELECT id, email, rol, entidad_id, nombres, apellidos, secreto_2fa, dos_pasos_activo, activo 
         FROM usuarios 
         WHERE id = $1`,
        [usuarioId]
    );

    const usuario = rows[0];
    if (!usuario || !usuario.activo) {
        throw crearError('Usuario no encontrado o inactivo', 401);
    }

    if (!usuario.secreto_2fa || !usuario.dos_pasos_activo) {
        throw crearError('El 2FA no está configurado para este usuario', 400);
    }

    let esValido = false;
    try {
        const resultado = await otplib.verify({
            secret: usuario.secreto_2fa,
            token: String(codigo).trim(),
            epochTolerance: 30
        });
        esValido = Boolean(resultado && (resultado === true || resultado.valid === true));
    } catch {
        esValido = false;
    }

    if (!esValido) {
        throw crearError('Código incorrecto', 401);
    }

    return {
        tokenAcceso: firmarToken(
            {
                sub: usuario.id,
                email: usuario.email,
                rol: usuario.rol,
                entidad_id: usuario.entidad_id,
                etapa: 'completa'
            },
            '8h'
        ),
        user: {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol,
            nombres: usuario.nombres,
            apellidos: usuario.apellidos,
            entidad_id: usuario.entidad_id,
            dos_pasos_activo: true
        }
    };
};


import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

const PASSWORD_TEXTO_PLANO = 'Password123!';
const CORREOS_SEMILLA = [
    'admin@viaalerta.gob.pe',
    'operaciones@mml.gob.pe',
    'operaciones@sedapal.com.pe',
    'ciudadano@correo.pe'
];

const resetearPasswordsSemilla = async () => {
    try {
        console.log('--- RESETEO DE CONTRASEÑAS SEMILLA ---');
        console.log(`Generando hash bcrypt para: ${PASSWORD_TEXTO_PLANO}...`);
        const nuevoHash = await bcrypt.hash(PASSWORD_TEXTO_PLANO, 10);

        const verificacion = await bcrypt.compare(PASSWORD_TEXTO_PLANO, nuevoHash);
        if (!verificacion) {
            throw new Error('La verificación local de bcrypt.compare falló para el nuevo hash');
        }
        console.log('✔ Verificación local con bcrypt.compare exitosa.');

        console.log('Actualizando contraseñas en PostgreSQL (Supabase)...');
        const query = `
            UPDATE usuarios
            SET password_hash = $1
            WHERE email = ANY($2::text[])
            RETURNING id, email, rol, dni, nombres, apellidos, activo;
        `;

        const { rows } = await pool.query(query, [nuevoHash, CORREOS_SEMILLA]);

        console.log(`✔ Usuarios actualizados: ${rows.length}`);
        rows.forEach(u => {
            console.log(`  - [${u.rol}] ${u.email} (DNI: ${u.dni}) - Activo: ${u.activo}`);
        });

        // Asegurarse de que todos los correos semilla esperados existan
        const emailsEncontrados = rows.map(r => r.email.toLowerCase());
        for (const correo of CORREOS_SEMILLA) {
            if (!emailsEncontrados.includes(correo.toLowerCase())) {
                console.warn(`⚠ Advertencia: El correo semilla '${correo}' no fue encontrado en la base de datos.`);
            }
        }

        console.log('✔ Sincronización completada exitosamente.');
    } catch (error) {
        console.error('❌ Error durante la sincronización:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
};

resetearPasswordsSemilla();

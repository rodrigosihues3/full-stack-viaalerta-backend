process.env.NODE_ENV = 'test';

import http from 'http';
import * as otplib from 'otplib';
import { pool } from '../src/config/db.js';
import { firmarToken } from '../src/utils/jwt.js';

const { app } = await import('../server.js');

const PORT = 3098;
let server;

const request = async (method, path, body = null, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };

    const res = await fetch(`http://localhost:${PORT}${path}`, options);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
};

const assert = (condition, message) => {
    if (!condition) {
        console.error(`❌ FALLÓ ASERCIÓN: ${message}`);
        throw new Error(message);
    }
    console.log(`  ✔ ${message}`);
};

const ejecutarPruebas = async () => {
    console.log('========================================================================');
    console.log('   INICIANDO TEST: DIRECTIVA TÉCNICA 1 - GOBERNANZA, 2FA, CRUD ENTIDADES');
    console.log('========================================================================\n');

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    console.log(`[TEST HARNESS] Servidor iniciado en puerto ${PORT}\n`);

    try {
        const adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const ciudadanoId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
        const operadorMmlId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

        const tokenAdmin = firmarToken(
            { sub: adminId, email: 'admin@viaalerta.gob.pe', rol: 'SUPER_ADMIN', etapa: 'completa' },
            '1h'
        );
        const tokenCiudadano = firmarToken(
            { sub: ciudadanoId, email: 'ciudadano@correo.pe', rol: 'CIUDADANO', etapa: 'completa' },
            '1h'
        );
        const tokenOperador = firmarToken(
            { sub: operadorMmlId, email: 'operaciones@mml.gob.pe', rol: 'OPERADOR_ENTIDAD', etapa: 'completa' },
            '1h'
        );

        // -----------------------------------------------------------------
        // TEST 1: Configurar, Activar, Verificar login con 2FA y Desactivar 2FA
        // -----------------------------------------------------------------
        console.log('--- TEST 1: Flujo Completo y Desactivación de 2FA ---');
        
        // Primero asegurar que esté desactivado
        await request('POST', '/api/auth/2fa/desactivar', {}, tokenCiudadano);

        // Configurar 2FA
        const resConfig = await request('POST', '/api/auth/2fa/configurar', {}, tokenCiudadano);
        assert(resConfig.status === 200, 'POST /api/auth/2fa/configurar responde 200');
        assert(resConfig.data.secreto, 'Secreto TOTP generado');

        // Activar 2FA usando otplib con el secreto generado
        const totpCode = await otplib.generateSecret(); // solo para asegurar módulo cargado
        const codigoActivar = await otplib.generate({ secret: resConfig.data.secreto });
        const resActivar = await request('POST', '/api/auth/2fa/activar', { codigo: codigoActivar }, tokenCiudadano);
        assert(resActivar.status === 200, 'POST /api/auth/2fa/activar responde 200');

        // Login del usuario con 2FA activado
        const resLoginCon2FA = await request('POST', '/api/auth/login', {
            email: 'ciudadano@correo.pe',
            password: 'Password123!'
        });
        assert(resLoginCon2FA.status === 200, 'POST /api/auth/login responde 200');
        assert(resLoginCon2FA.data.requiere2FA === true, 'Login detecta 2FA activo y solicita segundo factor');
        assert(resLoginCon2FA.data.tokenTemporal, 'Login entrega token temporal para 2FA');

        // Desactivar 2FA con token completo
        const resDesactivar = await request('POST', '/api/auth/2fa/desactivar', {}, tokenCiudadano);
        assert(resDesactivar.status === 200, 'POST /api/auth/2fa/desactivar responde 200');
        assert(resDesactivar.data.dos_pasos_activo === false, 'Respuesta confirma dos_pasos_activo: false');
        assert(resDesactivar.data.mensaje.includes('desactivado'), 'Mensaje de desactivación correcto');

        // Login posterior tras desactivar 2FA -> no debe pedir TOTP
        const resLoginSin2FA = await request('POST', '/api/auth/login', {
            email: 'ciudadano@correo.pe',
            password: 'Password123!'
        });
        assert(resLoginSin2FA.status === 200, 'Login posterior responde 200');
        assert(!resLoginSin2FA.data.requiere2FA, 'Login no requiere 2FA tras desactivación');
        assert(resLoginSin2FA.data.tokenAcceso, 'Login entrega tokenAcceso completo directo');
        console.log('✓ TEST 1 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // TEST 2: Endpoint A - GET /api/admin/metricas
        // -----------------------------------------------------------------
        console.log('--- TEST 2: Métricas Globales de Gobernanza (/api/admin/metricas) ---');
        
        // Rechazo para roles no SUPER_ADMIN
        const resMetricasForbidden = await request('GET', '/api/admin/metricas', null, tokenCiudadano);
        assert(resMetricasForbidden.status === 403, 'Ciudadano es rechazado con 403 al consultar métricas');

        const resMetricasOperador = await request('GET', '/api/admin/metricas', null, tokenOperador);
        assert(resMetricasOperador.status === 403, 'Operador es rechazado con 403 al consultar métricas');

        // Acceso permitido para SUPER_ADMIN
        const resMetricas = await request('GET', '/api/admin/metricas', null, tokenAdmin);
        assert(resMetricas.status === 200, 'SUPER_ADMIN consulta métricas exitosamente (200 OK)');
        assert(typeof resMetricas.data.total_entidades === 'number', 'total_entidades es numérico');
        assert(resMetricas.data.desglose_entidades && typeof resMetricas.data.desglose_entidades.MML === 'number', 'desglose MML presente');
        assert(typeof resMetricas.data.total_operadores === 'number', 'total_operadores es numérico');
        assert(typeof resMetricas.data.total_ciudadanos === 'number', 'total_ciudadanos es numérico');
        assert(typeof resMetricas.data.fiabilidad_global === 'number', 'fiabilidad_global calculada correctamente');
        console.log('  Valores métricas:', resMetricas.data);
        console.log('✓ TEST 2 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // TEST 3: Endpoint B - GET /api/admin/usuarios con Fiabilidad
        // -----------------------------------------------------------------
        console.log('--- TEST 3: Listado de Usuarios y Fiabilidad (/api/admin/usuarios) ---');
        
        const resUsuariosForbidden = await request('GET', '/api/admin/usuarios', null, tokenCiudadano);
        assert(resUsuariosForbidden.status === 403, 'Ciudadano bloqueado de /api/admin/usuarios (403)');

        const resUsuarios = await request('GET', '/api/admin/usuarios', null, tokenAdmin);
        assert(resUsuarios.status === 200, 'SUPER_ADMIN consulta lista de usuarios (200 OK)');
        assert(Array.isArray(resUsuarios.data), 'Retorna array de usuarios');
        assert(resUsuarios.data.length > 0, 'La lista contiene usuarios');
        
        const primerUsuario = resUsuarios.data[0];
        assert(primerUsuario.id && primerUsuario.email, 'Usuario contiene id y email');
        assert(typeof primerUsuario.fiabilidad_pct === 'number', 'fiabilidad_pct calculada como porcentaje numérico');
        assert(primerUsuario.fiabilidad_pct >= 0 && primerUsuario.fiabilidad_pct <= 100, 'fiabilidad_pct entre 0 y 100');
        console.log(`  Muestra de usuario auditado: ${primerUsuario.nombres} ${primerUsuario.apellidos} - Fiabilidad: ${primerUsuario.fiabilidad_pct}%`);
        console.log('✓ TEST 3 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // TEST 4: Endpoint C - PATCH /api/admin/usuarios/:id/estado
        // -----------------------------------------------------------------
        console.log('--- TEST 4: Modificación de Estado Operativo de Usuario ---');
        
        // Bloqueo de auto-desactivación de Superadmin
        const resAutoBloqueo = await request('PATCH', `/api/admin/usuarios/${adminId}/estado`, { activo: false }, tokenAdmin);
        assert(resAutoBloqueo.status === 400, 'Superadmin no puede desactivar su propia cuenta (400)');

        // Desactivación de un ciudadano
        const resDesactivarUser = await request('PATCH', `/api/admin/usuarios/${ciudadanoId}/estado`, { activo: false }, tokenAdmin);
        assert(resDesactivarUser.status === 200, 'Superadmin desactiva ciudadano (200 OK)');
        assert(resDesactivarUser.data.activo === false, 'Estado activo actualizado a false');

        // Reactivación del ciudadano
        const resReactivarUser = await request('PATCH', `/api/admin/usuarios/${ciudadanoId}/estado`, { activo: true }, tokenAdmin);
        assert(resReactivarUser.status === 200, 'Superadmin reactiva ciudadano (200 OK)');
        assert(resReactivarUser.data.activo === true, 'Estado activo actualizado a true');
        console.log('✓ TEST 4 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // TEST 5: Endpoint D y E - Notificaciones Institucionales
        // -----------------------------------------------------------------
        console.log('--- TEST 5: Emisión y Consulta de Notificaciones Ciudadanas ---');
        
        const notifPayload = {
            titulo: 'Advertencia Institucional de Prueba',
            mensaje: 'Se le notifica que su reporte ha sido registrado conforme a normativa metropolitana.',
            tipo: 'ADVERTENCIA'
        };

        const resNotificar = await request('POST', `/api/admin/usuarios/${ciudadanoId}/notificar`, notifPayload, tokenAdmin);
        assert(resNotificar.status === 201, 'POST /api/admin/usuarios/:id/notificar responde 201 CREATED');
        assert(resNotificar.data.id, 'Notificación tiene id asignado');
        assert(resNotificar.data.usuario_id === ciudadanoId, 'Notificación asignada al usuario correcto');
        assert(resNotificar.data.titulo === notifPayload.titulo, 'Título de notificación coincide');

        // Consulta desde el portal ciudadano
        const resMisNotif = await request('GET', '/api/usuarios/notificaciones', null, tokenCiudadano);
        assert(resMisNotif.status === 200, 'GET /api/usuarios/notificaciones responde 200 OK');
        assert(Array.isArray(resMisNotif.data), 'Retorna lista de notificaciones');
        const notifEncontrada = resMisNotif.data.find(n => n.id === resNotificar.data.id);
        assert(notifEncontrada, 'La notificación emitida se encuentra en la bandeja del ciudadano');
        assert(notifEncontrada.leido === false, 'Notificación inicialmente no leída');
        console.log('✓ TEST 5 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // TEST 6: CRUD de Entidades Públicas (/api/entidades)
        // -----------------------------------------------------------------
        console.log('--- TEST 6: CRUD Completo de Entidades Públicas bajo SUPER_ADMIN ---');
        
        // Bloqueo de creación para Ciudadano
        const entidadNueva = {
            nombre: 'Entidad Metropolitana de Prueba',
            ruc: '20123456789',
            sigla: 'EMP-TEST',
            jurisdiccion: 'Lima Centro',
            contacto: 'contacto@emp-test.gob.pe'
        };

        const resEntidadForbidden = await request('POST', '/api/entidades', entidadNueva, tokenCiudadano);
        assert(resEntidadForbidden.status === 403, 'Ciudadano bloqueado de POST /api/entidades (403)');

        // Creación por SUPER_ADMIN
        const resCrearEntidad = await request('POST', '/api/entidades', entidadNueva, tokenAdmin);
        assert(resCrearEntidad.status === 201, 'SUPER_ADMIN crea entidad (201 CREATED)');
        const idEntidadCreada = resCrearEntidad.data.id;
        assert(idEntidadCreada, 'Entidad creada tiene UUID');
        assert(resCrearEntidad.data.sigla === 'EMP-TEST', 'Sigla coincide');

        // Actualización de la entidad
        const resActualizarEntidad = await request('PUT', `/api/entidades/${idEntidadCreada}`, {
            nombre: 'Entidad Metropolitana Modificada',
            jurisdiccion: 'Lima Moderna y Norte'
        }, tokenAdmin);
        assert(resActualizarEntidad.status === 200, 'PUT /api/entidades/:id responde 200 OK');
        assert(resActualizarEntidad.data.nombre_oficial === 'Entidad Metropolitana Modificada', 'Nombre actualizado');

        // Cambio de estado (desactivación/activación)
        const resCambiarEstado = await request('PATCH', `/api/entidades/${idEntidadCreada}/estado`, {
            activo: false
        }, tokenAdmin);
        assert(resCambiarEstado.status === 200, 'PATCH /api/entidades/:id/estado responde 200 OK');
        assert(resCambiarEstado.data.activa === false, 'Entidad desactivada correctamente');

        // Eliminación / desactivación final
        const resEliminar = await request('DELETE', `/api/entidades/${idEntidadCreada}`, null, tokenAdmin);
        assert(resEliminar.status === 200, 'DELETE /api/entidades/:id responde 200 OK');

        // Limpieza de la entidad de prueba en la base de datos
        await pool.query('DELETE FROM entidades_publicas WHERE id = $1', [idEntidadCreada]);

        console.log('✓ TEST 6 SUPERADO CON ÉXITO\n');

        console.log('========================================================================');
        console.log('   TODAS LAS PRUEBAS DE LA DIRECTIVA TÉCNICA 1 PASARON CON ÉXITO (100%)');
        console.log('========================================================================');
        process.exit(0);
    } catch (error) {
        console.error('ERROR EN SMOKE TEST DIRECTIVA 1:', error);
        process.exit(1);
    } finally {
        if (server) server.close();
        await pool.end();
    }
};

ejecutarPruebas();

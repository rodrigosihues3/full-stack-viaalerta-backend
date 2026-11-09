process.env.NODE_ENV = 'test';

import { io as ioClient } from 'socket.io-client';
import { pool } from '../src/config/db.js';
import { firmarToken } from '../src/utils/jwt.js';

const { serverHttp } = await import('../server.js');

const PORT = 3097;
const BASE_URL = `http://localhost:${PORT}`;

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

    const res = await fetch(`${BASE_URL}${path}`, options);
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

const ejecutarPruebasFase4 = async () => {
    console.log('====================================================');
    console.log('   INICIANDO SMOKE TEST: FASE 4 VÍAALERTA WEBSOCKETS');
    console.log('====================================================\n');

    await new Promise((resolve) => serverHttp.listen(PORT, resolve));
    console.log(`[TEST HARNESS] Servidor HTTP + Socket.IO activo en puerto ${PORT}\n`);

    const socketsParaCerrar = [];

    try {
        // Preparar identidades y tokens
        const tokenCiudadano1 = firmarToken(
            { sub: 'dddddddd-dddd-dddd-dddd-dddddddddddd', rol: 'CIUDADANO', etapa: 'completa' },
            '1h'
        );
        const tokenCiudadano2 = firmarToken(
            { sub: 'c289a950-719c-4fb5-902d-002016f2ce65', rol: 'CIUDADANO', etapa: 'completa' },
            '1h'
        );
        const tokenOperadorMML = firmarToken(
            {
                sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                rol: 'OPERADOR_ENTIDAD',
                entidad_id: '11111111-1111-1111-1111-111111111111',
                etapa: 'completa'
            },
            '1h'
        );
        const tokenOperadorSEDAPAL = firmarToken(
            {
                sub: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                rol: 'OPERADOR_ENTIDAD',
                entidad_id: '22222222-2222-2222-2222-222222222222',
                etapa: 'completa'
            },
            '1h'
        );
        const tokenAdmin = firmarToken(
            { sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', rol: 'SUPER_ADMIN', etapa: 'completa' },
            '1h'
        );
        const tokenPendiente2FA = firmarToken(
            { sub: 'dddddddd-dddd-dddd-dddd-dddddddddddd', rol: 'CIUDADANO', etapa: 'pendiente-2fa' },
            '5m'
        );

        // -----------------------------------------------------------------
        // PRUEBA 1: Autenticación de Socket y Rechazo de Conexión
        // -----------------------------------------------------------------
        console.log('--- TEST 1: Control de Autenticación en Handshake ---');

        // 1.1 Rechazo sin token
        const socketSinToken = ioClient(BASE_URL, {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: false
        });
        socketsParaCerrar.push(socketSinToken);

        const errSinToken = await new Promise((resolve) => {
            socketSinToken.on('connect_error', resolve);
            socketSinToken.on('connect', () => resolve(new Error('Conectó sin token')));
        });
        assert(errSinToken.message === 'Autenticacion requerida', 'Rechazo de conexión sin token de autenticación');

        // 1.2 Rechazo con token temporal 'pendiente-2fa'
        const socket2FA = ioClient(BASE_URL, {
            auth: { token: tokenPendiente2FA },
            transports: ['websocket'],
            autoConnect: true,
            reconnection: false
        });
        socketsParaCerrar.push(socket2FA);

        const err2FA = await new Promise((resolve) => {
            socket2FA.on('connect_error', resolve);
            socket2FA.on('connect', () => resolve(new Error('Conectó con token pendiente-2fa')));
        });
        assert(err2FA.message === 'Autenticacion requerida', 'Rechazo de conexión con token en etapa pendiente-2fa');

        // 1.3 Rechazo con token corrupto
        const socketTokenInvalido = ioClient(BASE_URL, {
            auth: { token: 'jwt.falso.invalido' },
            transports: ['websocket'],
            autoConnect: true,
            reconnection: false
        });
        socketsParaCerrar.push(socketTokenInvalido);

        const errInvalido = await new Promise((resolve) => {
            socketTokenInvalido.on('connect_error', resolve);
            socketTokenInvalido.on('connect', () => resolve(new Error('Conectó con token corrupto')));
        });
        assert(errInvalido.message === 'Autenticacion requerida', 'Rechazo de conexión con token malformado o inválido');
        console.log('✓ TEST 1 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 2: Conexión Exitosa con Token 'completa' y Enrutamiento a Salas
        // -----------------------------------------------------------------
        console.log('--- TEST 2: Conexión Exitosa y Suscripción a Salas ---');

        // 2.1 Conectar Operador MML vía auth.token
        const socketOperadorMML = ioClient(BASE_URL, {
            auth: { token: tokenOperadorMML },
            transports: ['websocket'],
            reconnection: false
        });
        socketsParaCerrar.push(socketOperadorMML);

        await new Promise((resolve, reject) => {
            socketOperadorMML.on('connect', resolve);
            socketOperadorMML.on('connect_error', reject);
        });
        assert(socketOperadorMML.connected, 'Operador MML autenticado y conectado exitosamente');

        // 2.2 Conectar Super Admin vía encabezado Authorization
        const socketAdmin = ioClient(BASE_URL, {
            extraHeaders: { Authorization: `Bearer ${tokenAdmin}` },
            transports: ['websocket'],
            reconnection: false
        });
        socketsParaCerrar.push(socketAdmin);

        await new Promise((resolve, reject) => {
            socketAdmin.on('connect', resolve);
            socketAdmin.on('connect_error', reject);
        });
        assert(socketAdmin.connected, 'Super Admin autenticado vía header Authorization');

        // 2.3 Conectar Operador SEDAPAL vía auth.token
        const socketOperadorSEDAPAL = ioClient(BASE_URL, {
            auth: { token: tokenOperadorSEDAPAL },
            transports: ['websocket'],
            reconnection: false
        });
        socketsParaCerrar.push(socketOperadorSEDAPAL);

        await new Promise((resolve, reject) => {
            socketOperadorSEDAPAL.on('connect', resolve);
            socketOperadorSEDAPAL.on('connect_error', reject);
        });
        assert(socketOperadorSEDAPAL.connected, 'Operador SEDAPAL autenticado y conectado');
        console.log('✓ TEST 2 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 3: Emisión y Recepción en Tiempo Real: 'incidente:creado'
        // -----------------------------------------------------------------
        console.log('--- TEST 3: Emisión en Tiempo Real de incidente:creado y Aislamiento por Sala ---');

        const promesaEventoCreadoMML = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout esperando incidente:creado en MML')), 4000);
            socketOperadorMML.once('incidente:creado', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });

        const promesaEventoCreadoAdmin = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout esperando incidente:creado en Admin')), 4000);
            socketAdmin.once('incidente:creado', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });

        let sedapalRecibioIncidenteMML = false;
        socketOperadorSEDAPAL.once('incidente:creado', () => {
            sedapalRecibioIncidenteMML = true;
        });

        // Ciudadano 1 crea un incidente asignado a MML (CAT-01)
        const nuevoIncidentePayload = {
            categoria_id: 'CAT-01',
            latitud: -12.052000,
            longitud: -77.039000,
            direccion_referencial: 'Jr. de la Unión cdra 8, Lima',
            distrito: 'Cercado de Lima',
            severidad: 'ALTA',
            observaciones_ciudadano: 'Hundimiento con filtración visible',
            ia_diagnostico: 'Deterioro estructural en calzada',
            ia_confianza: 94.00,
            ia_severidad: 'ALTA',
            ia_recomendacion: 'Intervención técnica de urgencia'
        };

        const resCrear = await request('POST', '/api/incidentes', nuevoIncidentePayload, tokenCiudadano1);
        assert(resCrear.status === 201, 'POST /api/incidentes ejecutado con 201 CREATED');
        const incidenteCreado = resCrear.data;

        const eventoMML = await promesaEventoCreadoMML;
        assert(eventoMML.id === incidenteCreado.id, 'Operador MML recibió evento en tiempo real con ID correcto');
        assert(eventoMML.ticket_folio === incidenteCreado.ticket_folio, `Folio recibido en evento MML coincide (${eventoMML.ticket_folio})`);
        assert(eventoMML.entidad_asignada_id === '11111111-1111-1111-1111-111111111111', 'Entidad asignada resuelta correctamente');

        const eventoAdmin = await promesaEventoCreadoAdmin;
        assert(eventoAdmin.id === incidenteCreado.id, 'Super Admin recibió evento global en tiempo real');

        // Esperar brevemente para verificar que SEDAPAL NO recibió el evento de MML
        await new Promise((r) => setTimeout(r, 400));
        assert(!sedapalRecibioIncidenteMML, 'Aislamiento de salas verificado: Operador SEDAPAL NO recibió incidente de MML');
        console.log('✓ TEST 3 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 4: Emisión en Tiempo Real: 'incidente:estado_actualizado'
        // -----------------------------------------------------------------
        console.log('--- TEST 4: Emisión en Tiempo Real de incidente:estado_actualizado ---');

        const promesaEstadoMML = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout esperando incidente:estado_actualizado en MML')), 4000);
            socketOperadorMML.once('incidente:estado_actualizado', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });

        const promesaEstadoSEDAPAL = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout esperando incidente:estado_actualizado en SEDAPAL')), 4000);
            socketOperadorSEDAPAL.once('incidente:estado_actualizado', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });

        // Operador MML cambia estado a REPARACION
        const resEstado = await request('PATCH', `/api/incidentes/${incidenteCreado.id}/estado`, {
            nuevoEstado: 'REPARACION',
            notaObservacion: 'Equipo de obras viales desplegado en ubicación'
        }, tokenOperadorMML);
        assert(resEstado.status === 200, 'PATCH /api/incidentes/:id/estado respondió 200 OK');

        const [evEstadoMML, evEstadoSEDAPAL] = await Promise.all([promesaEstadoMML, promesaEstadoSEDAPAL]);
        assert(evEstadoMML.incidenteId === incidenteCreado.id, 'Evento de estado recibido en MML con incidenteId correcto');
        assert(evEstadoMML.nuevoEstado === 'REPARACION', 'Evento notifica nuevoEstado REPARACION');
        assert(evEstadoMML.historial.estado_anterior === 'REGISTRADO', 'Historial reporta transición desde REGISTRADO');
        assert(evEstadoSEDAPAL.incidenteId === incidenteCreado.id, 'Sala general: Operador SEDAPAL también recibe actualización de estado');
        console.log('✓ TEST 4 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 5: Emisión en Tiempo Real: 'incidente:confirmado'
        // -----------------------------------------------------------------
        console.log('--- TEST 5: Emisión en Tiempo Real de incidente:confirmado ---');

        const promesaConfirmacion = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout esperando incidente:confirmado')), 4000);
            socketOperadorMML.once('incidente:confirmado', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });

        // Ciudadano 2 confirma el incidente
        const resConf = await request('POST', `/api/incidentes/${incidenteCreado.id}/confirmar`, {
            foto_adicional_url: 'https://storage.viaalerta.pe/evidencia-ws-test.jpg'
        }, tokenCiudadano2);
        assert(resConf.status === 201, 'POST /api/incidentes/:id/confirmar respondió 201 CREATED');

        const evConfirmacion = await promesaConfirmacion;
        assert(evConfirmacion.incidenteId === incidenteCreado.id, 'Evento confirmado recibido con incidenteId verificado');
        assert(evConfirmacion.nuevoContador === 2, 'Evento confirmado notifica incremento a 2 confirmaciones');
        assert(evConfirmacion.entidadId === '11111111-1111-1111-1111-111111111111', 'Evento reporta entidadId asignada');
        console.log('✓ TEST 5 SUPERADO CON ÉXITO\n');

        console.log('====================================================');
        console.log('   TODAS LAS PRUEBAS DE LA FASE 4 PASARON (100%)    ');
        console.log('====================================================');

    } finally {
        for (const sock of socketsParaCerrar) {
            if (sock && sock.connected) {
                sock.disconnect();
            }
        }
        await new Promise((resolve) => serverHttp.close(resolve));
        await pool.end();
    }
};

ejecutarPruebasFase4().catch((err) => {
    console.error('ERROR EN SMOKE TEST FASE 4:', err);
    process.exit(1);
});


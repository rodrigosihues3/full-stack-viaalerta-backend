process.env.NODE_ENV = 'test';

import { io as ioClient } from 'socket.io-client';
import { pool } from '../src/config/db.js';
import { firmarToken } from '../src/utils/jwt.js';

const { serverHttp } = await import('../server.js');

const PORT = 3098;
const BASE_URL = `http://localhost:${PORT}`;

const request = async (method, path, body = null, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
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

const ejecutarPruebasCiudadano = async () => {
    console.log('==============================================================');
    console.log('   SMOKE TEST: MÓDULO CIUDADANO (DNI, NOTIFICACIONES, MAPA)   ');
    console.log('==============================================================\n');

    await new Promise((resolve) => serverHttp.listen(PORT, resolve));
    const socketsParaCerrar = [];
    let incidentePruebaId = null;
    let folioPrueba = null;

    try {
        const idCiudadano1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd'; // Ana Torres Meza (DNI 73232323)
        const idCiudadanoJean = '7253736f-c60c-45a9-b5f2-2cde225fec3a'; // Jean Franco Dávila Grandez (DNI 73977736)
        const idCiudadano2 = 'c289a950-719c-4fb5-902d-002016f2ce65'; // Auditor Técnico (DNI 87654321)

        const tokenCiudadano1 = firmarToken(
            { sub: idCiudadano1, rol: 'CIUDADANO', etapa: 'completa' },
            '1h'
        );
        const tokenCiudadanoJean = firmarToken(
            { sub: idCiudadanoJean, rol: 'CIUDADANO', etapa: 'completa' },
            '1h'
        );
        const tokenCiudadano2 = firmarToken(
            { sub: idCiudadano2, rol: 'CIUDADANO', etapa: 'completa' },
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

        // -----------------------------------------------------------------
        // PRUEBA 1: Verificación del DNI en el Perfil del Ciudadano
        // -----------------------------------------------------------------
        console.log('--- TEST 1: Recuperación del DNI desde Base de Datos (/api/auth/perfil) ---');
        const resPerfil1 = await request('GET', '/api/auth/perfil', null, tokenCiudadano1);
        assert(resPerfil1.status === 200, 'GET /api/auth/perfil responde 200 OK para Ciudadano 1');
        assert(resPerfil1.data?.user?.dni === '73232323', `DNI de Ciudadano 1 recuperado correctamente (${resPerfil1.data?.user?.dni})`);

        const resPerfilJean = await request('GET', '/api/auth/perfil', null, tokenCiudadanoJean);
        assert(resPerfilJean.status === 200, 'GET /api/auth/perfil responde 200 OK para Jean Franco Dávila Grandez');
        assert(resPerfilJean.data?.user?.dni === '73977736', `DNI de Jean Franco Dávila Grandez recuperado (${resPerfilJean.data?.user?.dni})`);
        console.log('✓ TEST 1 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 2: Notificaciones Persistentes y Tiempo Real + Deduplicación
        // -----------------------------------------------------------------
        console.log('--- TEST 2: Notificaciones Persistentes, Tiempo Real y No Duplicación ---');
        const socketCiudadanoJean = ioClient(BASE_URL, {
            auth: { token: tokenCiudadanoJean },
            transports: ['websocket'],
            reconnection: false
        });
        socketsParaCerrar.push(socketCiudadanoJean);

        await new Promise((resolve, reject) => {
            socketCiudadanoJean.on('connect', resolve);
            socketCiudadanoJean.on('connect_error', reject);
        });
        assert(socketCiudadanoJean.connected, 'Socket del ciudadano conectado y suscrito a su sala personal');

        // Escuchar notificación en tiempo real al crear reporte
        const promesaNotifCreacion = new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('Timeout esperando notificacion:nueva (REGISTRADO)')), 5000);
            socketCiudadanoJean.once('notificacion:nueva', (data) => {
                clearTimeout(t);
                resolve(data);
            });
        });

        const resCrear = await request('POST', '/api/incidentes', {
            categoria_id: 'CAT-01',
            latitud: -12.046500,
            longitud: -77.042900,
            direccion_referencial: 'Av. Nicolás de Piérola cdra 7, Lima',
            distrito: 'Cercado de Lima',
            severidad: 'ALTA',
            observaciones_ciudadano: 'Bache severo en carril central'
        }, tokenCiudadanoJean);

        assert(resCrear.status === 201, 'POST /api/incidentes crea reporte exitosamente');
        incidentePruebaId = resCrear.data.id;
        folioPrueba = resCrear.data.ticket_folio;

        const notifCreacion = await promesaNotifCreacion;
        assert(notifCreacion.tipo === 'REGISTRADO', 'Notificación en tiempo real recibida con estado REGISTRADO');
        assert(notifCreacion.ticket_folio === folioPrueba, `Notificación vinculada al folio ${folioPrueba}`);
        assert(notifCreacion.leido === false, 'Notificación inicial marcada como no leída');

        // Cambiar estado a EVALUACION y esperar notificación en tiempo real
        const promesaNotifEvaluacion = new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('Timeout esperando notificacion:nueva (EVALUACION)')), 5000);
            socketCiudadanoJean.once('notificacion:nueva', (data) => {
                clearTimeout(t);
                resolve(data);
            });
        });

        const resEval = await request('PATCH', `/api/incidentes/${incidentePruebaId}/estado`, {
            nuevoEstado: 'EVALUACION',
            notaObservacion: 'En revisión por ingeniería vial'
        }, tokenOperadorMML);
        assert(resEval.status === 200, 'Operador MML cambia estado a EVALUACION');

        const notifEvaluacion = await promesaNotifEvaluacion;
        assert(notifEvaluacion.tipo === 'EVALUACION', 'Ciudadano recibe notificación en tiempo real de estado EVALUACION');
        assert(notifEvaluacion.mensaje.includes('En Evaluación'), 'Mensaje descriptivo indica el nuevo estado En Evaluación');

        // Intentar actualizar nuevamente con el MISMO estado (EVALUACION) -> NO debe crear notificación duplicada
        const conteoAntes = await request('GET', '/api/notificaciones', null, tokenCiudadanoJean);
        const totalAntes = conteoAntes.data.notificaciones.length;

        await request('PATCH', `/api/incidentes/${incidentePruebaId}/estado`, {
            nuevoEstado: 'EVALUACION',
            notaObservacion: 'Actualización repetida del mismo estado'
        }, tokenOperadorMML);

        const conteoDespues = await request('GET', '/api/notificaciones', null, tokenCiudadanoJean);
        assert(
            conteoDespues.data.notificaciones.length === totalAntes,
            'No se generan notificaciones duplicadas ante actualizaciones repetidas del mismo estado'
        );

        // Verificar aislamiento: Ciudadano 2 NO puede marcar como leída la notificación de Jean Franco
        const resIntruso = await request('PATCH', `/api/notificaciones/${notifEvaluacion.id}/leer`, null, tokenCiudadano2);
        assert(resIntruso.status === 404, 'Aislamiento verificado: otro ciudadano no puede modificar notificaciones ajenas (HTTP 404)');

        // Marcar notificación individual como leída
        const resLeerUna = await request('PATCH', `/api/notificaciones/${notifEvaluacion.id}/leer`, null, tokenCiudadanoJean);
        assert(resLeerUna.status === 200 && resLeerUna.data.leido === true, 'Notificación marcada como leída individualmente');

        // Marcar todas como leídas
        const resLeerTodas = await request('PATCH', '/api/notificaciones/leer-todas', null, tokenCiudadanoJean);
        assert(resLeerTodas.status === 200, 'PATCH /api/notificaciones/leer-todas ejecutado correctamente');

        const resVerifLeidas = await request('GET', '/api/notificaciones', null, tokenCiudadanoJean);
        assert(resVerifLeidas.data.noLeidasCount === 0, 'Contador de notificaciones pendientes actualizado a 0');
        console.log('✓ TEST 2 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 3: Monitor Vial Georreferenciado (/api/incidentes/cercanos)
        // -----------------------------------------------------------------
        console.log('--- TEST 3: Monitor Vial Georreferenciado y Privacidad ---');
        const resCercanosInvalido = await request('GET', '/api/incidentes/cercanos?lat=abc&lng=-77', null, tokenCiudadanoJean);
        assert(resCercanosInvalido.status === 400, 'Rechaza coordenadas inválidas con HTTP 400');

        const resCercanos = await request(
            'GET',
            '/api/incidentes/cercanos?lat=-12.046374&lng=-77.042793&radio=15',
            null,
            tokenCiudadanoJean
        );
        assert(resCercanos.status === 200, 'GET /api/incidentes/cercanos responde 200 OK');
        assert(Array.isArray(resCercanos.data) && resCercanos.data.length > 0, 'Retorna incidentes reales dentro del radio');

        const primerIncidente = resCercanos.data[0];
        assert(typeof primerIncidente.distancia_km === 'number', `Calcula distancia geodésica real (${primerIncidente.distancia_km} km)`);
        assert(!('creador_nombres' in primerIncidente) && !('usuario_creador_id' in primerIncidente), 'Privacidad protegida: no expone datos personales del creador');

        // Verificar ordenamiento ascendente por distancia
        for (let i = 1; i < resCercanos.data.length; i++) {
            assert(
                resCercanos.data[i].distancia_km >= resCercanos.data[i - 1].distancia_km,
                `Orden por cercanía verificado (${resCercanos.data[i - 1].distancia_km} km <= ${resCercanos.data[i].distancia_km} km)`
            );
        }
        console.log('✓ TEST 3 SUPERADO CON ÉXITO\n');

        console.log('==============================================================');
        console.log('   TODAS LAS PRUEBAS DEL MÓDULO CIUDADANO PASARON (100%)      ');
        console.log('==============================================================');
    } finally {
        // Limpiar datos efímeros creados exclusivamente por el smoke test
        if (folioPrueba) {
            await pool.query(
                `DELETE FROM notificaciones_usuario WHERE titulo LIKE '%' || $1 || '%' OR mensaje LIKE '%' || $1 || '%'`,
                [folioPrueba]
            ).catch(() => {});
        }
        if (incidentePruebaId) {
            await pool.query(`DELETE FROM incidentes WHERE id = $1`, [incidentePruebaId]).catch(() => {});
        }
        for (const sock of socketsParaCerrar) {
            if (sock && sock.connected) sock.disconnect();
        }
        await new Promise((resolve) => serverHttp.close(resolve));
        await pool.end();
    }
};

ejecutarPruebasCiudadano().catch((err) => {
    console.error('ERROR EN SMOKE TEST CIUDADANO:', err);
    process.exit(1);
});

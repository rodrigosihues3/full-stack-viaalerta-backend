


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."estado_incidente_enum" AS ENUM (
    'REGISTRADO',
    'EVALUACION',
    'REPARACION',
    'RESUELTO',
    'DESESTIMADO'
);


ALTER TYPE "public"."estado_incidente_enum" OWNER TO "postgres";


CREATE TYPE "public"."rol_usuario_enum" AS ENUM (
    'CIUDADANO',
    'OPERADOR_ENTIDAD',
    'SUPER_ADMIN'
);


ALTER TYPE "public"."rol_usuario_enum" OWNER TO "postgres";


CREATE TYPE "public"."severidad_enum" AS ENUM (
    'BAJA',
    'MEDIA',
    'ALTA',
    'CRITICA'
);


ALTER TYPE "public"."severidad_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_actualizar_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_actualizar_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_confirmaciones_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE incidentes
        SET confirmaciones_count = confirmaciones_count + 1
        WHERE id = NEW.incidente_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE incidentes
        SET confirmaciones_count = GREATEST(1, confirmaciones_count - 1)
        WHERE id = OLD.incidente_id;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."fn_sync_confirmaciones_count"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."categorias_incidentes" (
    "id" character varying(20) NOT NULL,
    "nombre" character varying(120) NOT NULL,
    "entidad_responsable_id" "uuid" NOT NULL,
    "severidad_defecto" "public"."severidad_enum" DEFAULT 'MEDIA'::"public"."severidad_enum" NOT NULL,
    "icono_identificador" character varying(50) NOT NULL
);


ALTER TABLE "public"."categorias_incidentes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."confirmaciones_incidente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "incidente_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "foto_adicional_url" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."confirmaciones_incidente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entidades_publicas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ruc" character(11),
    "sigla" character varying(20) NOT NULL,
    "nombre_oficial" character varying(200) NOT NULL,
    "jurisdiccion_competencia" character varying(150) NOT NULL,
    "telefono_emergencia" character varying(30),
    "correo_despacho" character varying(120) NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entidades_publicas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_estados_incidente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "incidente_id" "uuid" NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "estado_anterior" "public"."estado_incidente_enum",
    "estado_nuevo" "public"."estado_incidente_enum" NOT NULL,
    "nota_observacion" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."historial_estados_incidente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incidentes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_folio" character varying(30) NOT NULL,
    "entidad_asignada_id" "uuid" NOT NULL,
    "usuario_creador_id" "uuid" NOT NULL,
    "categoria_id" character varying(20) NOT NULL,
    "latitud" double precision NOT NULL,
    "longitud" double precision NOT NULL,
    "direccion_referencial" "text" NOT NULL,
    "distrito" character varying(80) NOT NULL,
    "severidad" "public"."severidad_enum" DEFAULT 'MEDIA'::"public"."severidad_enum" NOT NULL,
    "estado" "public"."estado_incidente_enum" DEFAULT 'REGISTRADO'::"public"."estado_incidente_enum" NOT NULL,
    "observaciones_ciudadano" "text",
    "foto_url" "text",
    "ia_diagnostico" "text",
    "ia_confianza" numeric(5,2),
    "ia_severidad" "public"."severidad_enum",
    "ia_recomendacion" "text",
    "motivo_desestimacion" "text",
    "operador_resolucion_id" "uuid",
    "confirmaciones_count" integer DEFAULT 1 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_motivo_desestimacion" CHECK (((("estado" = 'DESESTIMADO'::"public"."estado_incidente_enum") AND ("motivo_desestimacion" IS NOT NULL)) OR (("estado" <> 'DESESTIMADO'::"public"."estado_incidente_enum") AND ("motivo_desestimacion" IS NULL))))
);


ALTER TABLE "public"."incidentes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entidad_id" "uuid",
    "rol" "public"."rol_usuario_enum" DEFAULT 'CIUDADANO'::"public"."rol_usuario_enum" NOT NULL,
    "dni" character(8),
    "email" character varying(150) NOT NULL,
    "password_hash" character varying(255) NOT NULL,
    "nombres" character varying(100) NOT NULL,
    "apellidos" character varying(100) NOT NULL,
    "secreto_2fa" character varying(64),
    "secreto_2fa_pendiente" character varying(64),
    "dos_pasos_activo" boolean DEFAULT false NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_dni_ciudadano" CHECK (((("rol" = 'CIUDADANO'::"public"."rol_usuario_enum") AND ("dni" IS NOT NULL) AND ("dni" ~ '^[0-9]{8}$'::"text")) OR ("rol" = ANY (ARRAY['OPERADOR_ENTIDAD'::"public"."rol_usuario_enum", 'SUPER_ADMIN'::"public"."rol_usuario_enum"])))),
    CONSTRAINT "chk_operador_entidad" CHECK (((("rol" = 'OPERADOR_ENTIDAD'::"public"."rol_usuario_enum") AND ("entidad_id" IS NOT NULL)) OR (("rol" = ANY (ARRAY['CIUDADANO'::"public"."rol_usuario_enum", 'SUPER_ADMIN'::"public"."rol_usuario_enum"])) AND ("entidad_id" IS NULL))))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notificaciones_usuario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "titulo" character varying(120) NOT NULL,
    "mensaje" "text" NOT NULL,
    "tipo" character varying(50) DEFAULT 'ADVERTENCIA'::character varying,
    "leido" boolean DEFAULT false,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notificaciones_usuario" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categorias_incidentes"
    ADD CONSTRAINT "categorias_incidentes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."confirmaciones_incidente"
    ADD CONSTRAINT "confirmaciones_incidente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entidades_publicas"
    ADD CONSTRAINT "entidades_publicas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entidades_publicas"
    ADD CONSTRAINT "entidades_publicas_ruc_key" UNIQUE ("ruc");



ALTER TABLE ONLY "public"."entidades_publicas"
    ADD CONSTRAINT "entidades_publicas_sigla_key" UNIQUE ("sigla");



ALTER TABLE ONLY "public"."historial_estados_incidente"
    ADD CONSTRAINT "historial_estados_incidente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_ticket_folio_key" UNIQUE ("ticket_folio");



ALTER TABLE ONLY "public"."confirmaciones_incidente"
    ADD CONSTRAINT "uq_incidente_usuario" UNIQUE ("incidente_id", "usuario_id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_dni_key" UNIQUE ("dni");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notificaciones_usuario"
    ADD CONSTRAINT "notificaciones_usuario_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_incidentes_coordenadas" ON "public"."incidentes" USING "btree" ("latitud", "longitud");



CREATE INDEX "idx_incidentes_entidad_estado" ON "public"."incidentes" USING "btree" ("entidad_asignada_id", "estado");



CREATE INDEX "idx_incidentes_usuario" ON "public"."incidentes" USING "btree" ("usuario_creador_id");



CREATE INDEX "idx_notif_usuario" ON "public"."notificaciones_usuario" USING "btree" ("usuario_id");



CREATE OR REPLACE TRIGGER "trg_incidentes_actualizado" BEFORE UPDATE ON "public"."incidentes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_actualizar_timestamp"();



CREATE OR REPLACE TRIGGER "trg_sync_confirmaciones" AFTER INSERT OR DELETE ON "public"."confirmaciones_incidente" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_confirmaciones_count"();



CREATE OR REPLACE TRIGGER "trg_usuarios_actualizado" BEFORE UPDATE ON "public"."usuarios" FOR EACH ROW EXECUTE FUNCTION "public"."fn_actualizar_timestamp"();



ALTER TABLE ONLY "public"."categorias_incidentes"
    ADD CONSTRAINT "categorias_incidentes_entidad_responsable_id_fkey" FOREIGN KEY ("entidad_responsable_id") REFERENCES "public"."entidades_publicas"("id");



ALTER TABLE ONLY "public"."confirmaciones_incidente"
    ADD CONSTRAINT "confirmaciones_incidente_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."confirmaciones_incidente"
    ADD CONSTRAINT "confirmaciones_incidente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."historial_estados_incidente"
    ADD CONSTRAINT "historial_estados_incidente_incidente_id_fkey" FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_estados_incidente"
    ADD CONSTRAINT "historial_estados_incidente_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_incidentes"("id");



ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_entidad_asignada_id_fkey" FOREIGN KEY ("entidad_asignada_id") REFERENCES "public"."entidades_publicas"("id");



ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_operador_resolucion_id_fkey" FOREIGN KEY ("operador_resolucion_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_usuario_creador_id_fkey" FOREIGN KEY ("usuario_creador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "public"."entidades_publicas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notificaciones_usuario"
    ADD CONSTRAINT "notificaciones_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_actualizar_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_actualizar_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_actualizar_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_confirmaciones_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_confirmaciones_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_confirmaciones_count"() TO "service_role";



GRANT ALL ON TABLE "public"."categorias_incidentes" TO "anon";
GRANT ALL ON TABLE "public"."categorias_incidentes" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias_incidentes" TO "service_role";



GRANT ALL ON TABLE "public"."confirmaciones_incidente" TO "anon";
GRANT ALL ON TABLE "public"."confirmaciones_incidente" TO "authenticated";
GRANT ALL ON TABLE "public"."confirmaciones_incidente" TO "service_role";



GRANT ALL ON TABLE "public"."entidades_publicas" TO "anon";
GRANT ALL ON TABLE "public"."entidades_publicas" TO "authenticated";
GRANT ALL ON TABLE "public"."entidades_publicas" TO "service_role";



GRANT ALL ON TABLE "public"."historial_estados_incidente" TO "anon";
GRANT ALL ON TABLE "public"."historial_estados_incidente" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_estados_incidente" TO "service_role";



GRANT ALL ON TABLE "public"."incidentes" TO "anon";
GRANT ALL ON TABLE "public"."incidentes" TO "authenticated";
GRANT ALL ON TABLE "public"."incidentes" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."notificaciones_usuario" TO "anon";
GRANT ALL ON TABLE "public"."notificaciones_usuario" TO "authenticated";
GRANT ALL ON TABLE "public"."notificaciones_usuario" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








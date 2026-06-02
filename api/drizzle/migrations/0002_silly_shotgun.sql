CREATE TABLE "driver_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motorista" text NOT NULL,
	"motorista_norm" text NOT NULL,
	"data_posicao" timestamp with time zone NOT NULL,
	"posicao_raw" text NOT NULL,
	"veiculo" text,
	"cidade" text,
	"uf" varchar(2),
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"geocoded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_positions_motorista_norm_data_posicao_unique" UNIQUE("motorista_norm","data_posicao")
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"cidade" text,
	"uf" varchar(2),
	"display_name" text,
	"provider" text DEFAULT 'nominatim' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" numeric(10, 8),
	"lng" numeric(11, 8),
	"geofence_id" uuid,
	"notes" text,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_geofence_id_geofences_id_fk" FOREIGN KEY ("geofence_id") REFERENCES "public"."geofences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_driver_positions_motorista_norm" ON "driver_positions" USING btree ("motorista_norm");--> statement-breakpoint
CREATE INDEX "idx_trip_events_trip" ON "trip_events" USING btree ("trip_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_trip_events_type" ON "trip_events" USING btree ("event_type");
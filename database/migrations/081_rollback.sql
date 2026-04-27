-- Rollback for migration 081: restore 075's view definitions
-- (re-includes source_nexrad_l2 in WHERE filter)

BEGIN;

DROP VIEW IF EXISTS verified_hail_events_public_sane;
DROP VIEW IF EXISTS verified_hail_events_public;

CREATE VIEW verified_hail_events_public AS
SELECT
    id, event_date, latitude, longitude, lat_bucket, lng_bucket, state,
    algorithm_hail_size_inches, algorithm_wind_mph,
    verified_hail_size_inches, verified_wind_mph,
    hail_size_inches, wind_mph, tornado_ef_rank,
    source_noaa_ncei, source_iem_lsr, source_ncei_swdi, source_mrms,
    source_nws_alert, source_iem_vtec, source_cocorahs, source_mping,
    source_synoptic, source_spc_wcm,
    (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_rep_report,
    (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE)) AS source_customer_report,
    source_groupme, source_hailtrace, source_ihm,
    source_nexrad_l2,
    (
        source_noaa_ncei::int + source_iem_lsr::int + source_ncei_swdi::int +
        source_mrms::int + source_nws_alert::int + source_iem_vtec::int +
        source_cocorahs::int + source_mping::int + source_synoptic::int +
        source_spc_wcm::int +
        (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
        (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE))::int +
        source_groupme::int + source_hailtrace::int + source_ihm::int +
        source_nexrad_l2::int
    ) AS public_verification_count,
    source_details,
    first_observed_at, last_updated_at
FROM verified_hail_events
WHERE
    source_noaa_ncei OR source_iem_lsr OR source_ncei_swdi OR source_mrms OR
    source_nws_alert OR source_iem_vtec OR source_cocorahs OR source_mping OR
    source_synoptic OR source_spc_wcm OR source_groupme OR source_hailtrace OR source_ihm OR
    source_nexrad_l2 OR
    (source_rep_report AND COALESCE(rep_report_verified_by_admin, FALSE)) OR
    (source_customer_report AND COALESCE(rep_report_verified_by_admin, FALSE));

CREATE VIEW verified_hail_events_public_sane AS
SELECT * FROM verified_hail_events_public
WHERE hail_size_inches IS NULL OR hail_size_inches <= 8.0;

COMMIT;

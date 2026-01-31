-- Update All-Time Insurance Revenue for Sales Reps
-- Source: RoofTrack App Screenshots (January 31, 2026)
-- Total: $67,102,236.23 across 57 reps

BEGIN;

-- Update each rep's all_time_revenue based on name matching
UPDATE sales_reps SET all_time_revenue = 9304576.75, updated_at = NOW() WHERE LOWER(display_name) LIKE '%luis%esteves%' OR LOWER(full_name) LIKE '%luis%esteves%';
UPDATE sales_reps SET all_time_revenue = 5703722.32, updated_at = NOW() WHERE LOWER(display_name) LIKE '%richie%riley%' OR LOWER(full_name) LIKE '%richie%riley%';
UPDATE sales_reps SET all_time_revenue = 5296700.77, updated_at = NOW() WHERE LOWER(display_name) LIKE '%ross%renzi%' OR LOWER(full_name) LIKE '%ross%renzi%';
UPDATE sales_reps SET all_time_revenue = 4732226.18, updated_at = NOW() WHERE LOWER(display_name) LIKE '%patrick%robertson%' OR LOWER(full_name) LIKE '%patrick%robertson%';
UPDATE sales_reps SET all_time_revenue = 3537682.37, updated_at = NOW() WHERE LOWER(display_name) LIKE '%michael%swearingen%' OR LOWER(full_name) LIKE '%michael%swearingen%';
UPDATE sales_reps SET all_time_revenue = 3239593.21, updated_at = NOW() WHERE LOWER(display_name) LIKE '%carlos%davila%' OR LOWER(full_name) LIKE '%carlos%davila%';
UPDATE sales_reps SET all_time_revenue = 2923363.59, updated_at = NOW() WHERE LOWER(display_name) LIKE '%andre%mealy%' OR LOWER(full_name) LIKE '%andre%mealy%';
UPDATE sales_reps SET all_time_revenue = 2745390.97, updated_at = NOW() WHERE LOWER(display_name) LIKE '%miguel%ocampo%' OR LOWER(full_name) LIKE '%miguel%ocampo%';
UPDATE sales_reps SET all_time_revenue = 2455179.30, updated_at = NOW() WHERE LOWER(display_name) LIKE '%jason%brown%' OR LOWER(full_name) LIKE '%jason%brown%';
UPDATE sales_reps SET all_time_revenue = 2371228.72, updated_at = NOW() WHERE LOWER(display_name) LIKE '%nick%bourdin%' OR LOWER(full_name) LIKE '%nick%bourdin%';
UPDATE sales_reps SET all_time_revenue = 1922119.33, updated_at = NOW() WHERE LOWER(display_name) LIKE '%navid%javid%' OR LOWER(full_name) LIKE '%navid%javid%';
UPDATE sales_reps SET all_time_revenue = 1920129.45, updated_at = NOW() WHERE LOWER(display_name) LIKE '%benjamin%salgado%' OR LOWER(full_name) LIKE '%benjamin%salgado%';
UPDATE sales_reps SET all_time_revenue = 1850868.33, updated_at = NOW() WHERE LOWER(display_name) LIKE '%shane%santangelo%' OR LOWER(full_name) LIKE '%shane%santangelo%';
UPDATE sales_reps SET all_time_revenue = 1667234.09, updated_at = NOW() WHERE LOWER(display_name) LIKE '%larry%hale%' OR LOWER(full_name) LIKE '%larry%hale%';
UPDATE sales_reps SET all_time_revenue = 1278709.25, updated_at = NOW() WHERE LOWER(display_name) LIKE '%reese%samala%' OR LOWER(full_name) LIKE '%reese%samala%';
UPDATE sales_reps SET all_time_revenue = 1136912.38, updated_at = NOW() WHERE LOWER(display_name) LIKE '%ryan%parker%' OR LOWER(full_name) LIKE '%ryan%parker%';
UPDATE sales_reps SET all_time_revenue = 1113901.42, updated_at = NOW() WHERE LOWER(display_name) LIKE '%mattias%kasparian%' OR LOWER(full_name) LIKE '%mattias%kasparian%';
UPDATE sales_reps SET all_time_revenue = 1000793.08, updated_at = NOW() WHERE LOWER(display_name) LIKE '%chris%aycock%' OR LOWER(full_name) LIKE '%chris%aycock%';
UPDATE sales_reps SET all_time_revenue = 982417.46, updated_at = NOW() WHERE LOWER(display_name) LIKE '%steve%mckim%' OR LOWER(full_name) LIKE '%steve%mckim%';
UPDATE sales_reps SET all_time_revenue = 955266.51, updated_at = NOW() WHERE LOWER(display_name) LIKE '%james%armel%' OR LOWER(full_name) LIKE '%james%armel%';
UPDATE sales_reps SET all_time_revenue = 861899.03, updated_at = NOW() WHERE LOWER(display_name) LIKE '%christian%bratton%' OR LOWER(full_name) LIKE '%christian%bratton%';
UPDATE sales_reps SET all_time_revenue = 800615.78, updated_at = NOW() WHERE LOWER(display_name) LIKE '%eric%philippeau%' OR LOWER(full_name) LIKE '%eric%philippeau%';
UPDATE sales_reps SET all_time_revenue = 776289.34, updated_at = NOW() WHERE LOWER(display_name) LIKE '%elijah%hicks%' OR LOWER(full_name) LIKE '%elijah%hicks%';
UPDATE sales_reps SET all_time_revenue = 731012.83, updated_at = NOW() WHERE LOWER(display_name) LIKE '%brandon%pernot%' OR LOWER(full_name) LIKE '%brandon%pernot%';
UPDATE sales_reps SET all_time_revenue = 705337.68, updated_at = NOW() WHERE LOWER(display_name) LIKE '%daniel%alonso%' OR LOWER(full_name) LIKE '%daniel%alonso%';
UPDATE sales_reps SET all_time_revenue = 688377.42, updated_at = NOW() WHERE LOWER(display_name) LIKE '%joseph%marcella%' OR LOWER(full_name) LIKE '%joseph%marcella%';
UPDATE sales_reps SET all_time_revenue = 631532.89, updated_at = NOW() WHERE LOWER(display_name) LIKE '%jimmy%brown%' OR LOWER(full_name) LIKE '%jimmy%brown%';
UPDATE sales_reps SET all_time_revenue = 603400.63, updated_at = NOW() WHERE LOWER(display_name) LIKE '%joseph%ammendola%' OR LOWER(full_name) LIKE '%joseph%ammendola%';
UPDATE sales_reps SET all_time_revenue = 571082.75, updated_at = NOW() WHERE LOWER(display_name) LIKE '%danny%ticktin%' OR LOWER(full_name) LIKE '%danny%ticktin%';
UPDATE sales_reps SET all_time_revenue = 523038.90, updated_at = NOW() WHERE LOWER(display_name) LIKE '%ian%thrash%' OR LOWER(full_name) LIKE '%ian%thrash%';
UPDATE sales_reps SET all_time_revenue = 460311.26, updated_at = NOW() WHERE LOWER(display_name) LIKE '%ryan%kiely%' OR LOWER(full_name) LIKE '%ryan%kiely%';
UPDATE sales_reps SET all_time_revenue = 459134.43, updated_at = NOW() WHERE LOWER(display_name) LIKE '%eric%rickel%' OR LOWER(full_name) LIKE '%eric%rickel%';
UPDATE sales_reps SET all_time_revenue = 375337.84, updated_at = NOW() WHERE LOWER(display_name) LIKE '%basel%halim%' OR LOWER(full_name) LIKE '%basel%halim%';
UPDATE sales_reps SET all_time_revenue = 339804.85, updated_at = NOW() WHERE LOWER(display_name) LIKE '%freddy%zellers%' OR LOWER(full_name) LIKE '%freddy%zellers%';
UPDATE sales_reps SET all_time_revenue = 326115.07, updated_at = NOW() WHERE LOWER(display_name) LIKE '%jonathan%alquijay%' OR LOWER(full_name) LIKE '%jonathan%alquijay%';
UPDATE sales_reps SET all_time_revenue = 278503.90, updated_at = NOW() WHERE LOWER(display_name) LIKE '%hunter%hall%' OR LOWER(full_name) LIKE '%hunter%hall%';
UPDATE sales_reps SET all_time_revenue = 251158.93, updated_at = NOW() WHERE LOWER(display_name) LIKE '%joseph%boyd%' OR LOWER(full_name) LIKE '%joseph%boyd%';
UPDATE sales_reps SET all_time_revenue = 236185.25, updated_at = NOW() WHERE LOWER(display_name) LIKE '%hugo%manrique%' OR LOWER(full_name) LIKE '%hugo%manrique%';
UPDATE sales_reps SET all_time_revenue = 225607.10, updated_at = NOW() WHERE LOWER(display_name) LIKE '%colin%koos%' OR LOWER(full_name) LIKE '%colin%koos%';
UPDATE sales_reps SET all_time_revenue = 183468.15, updated_at = NOW() WHERE LOWER(display_name) LIKE '%humberto%berrio%' OR LOWER(full_name) LIKE '%humberto%berrio%';
UPDATE sales_reps SET all_time_revenue = 135702.49, updated_at = NOW() WHERE LOWER(display_name) LIKE '%kerouls%gayed%' OR LOWER(full_name) LIKE '%kerouls%gayed%';
UPDATE sales_reps SET all_time_revenue = 134248.76, updated_at = NOW() WHERE LOWER(display_name) LIKE '%abraham%raz%' OR LOWER(full_name) LIKE '%abraham%raz%';
UPDATE sales_reps SET all_time_revenue = 112414.12, updated_at = NOW() WHERE LOWER(display_name) LIKE '%jalen%simms%' OR LOWER(full_name) LIKE '%jalen%simms%';
UPDATE sales_reps SET all_time_revenue = 74680.21, updated_at = NOW() WHERE LOWER(display_name) LIKE '%gabe%long%' OR LOWER(full_name) LIKE '%gabe%long%';
UPDATE sales_reps SET all_time_revenue = 66110.35, updated_at = NOW() WHERE LOWER(display_name) LIKE '%angel%ardid%' OR LOWER(full_name) LIKE '%angel%ardid%';
UPDATE sales_reps SET all_time_revenue = 64403.52, updated_at = NOW() WHERE LOWER(display_name) LIKE '%david%sura%' OR LOWER(full_name) LIKE '%david%sura%';
UPDATE sales_reps SET all_time_revenue = 56286.67, updated_at = NOW() WHERE LOWER(display_name) LIKE '%joseph%hong%' OR LOWER(full_name) LIKE '%joseph%hong%';
UPDATE sales_reps SET all_time_revenue = 52631.06, updated_at = NOW() WHERE LOWER(display_name) LIKE '%devin%fraser%' OR LOWER(full_name) LIKE '%devin%fraser%';
UPDATE sales_reps SET all_time_revenue = 45510.29, updated_at = NOW() WHERE LOWER(display_name) LIKE '%walid%saidani%' OR LOWER(full_name) LIKE '%walid%saidani%';
UPDATE sales_reps SET all_time_revenue = 43772.71, updated_at = NOW() WHERE LOWER(display_name) LIKE '%ahmed%mahmoud%' OR LOWER(full_name) LIKE '%ahmed%mahmoud%';
UPDATE sales_reps SET all_time_revenue = 35037.70, updated_at = NOW() WHERE LOWER(display_name) LIKE '%michael%gabriel%' OR LOWER(full_name) LIKE '%michael%gabriel%';
UPDATE sales_reps SET all_time_revenue = 32341.47, updated_at = NOW() WHERE LOWER(display_name) LIKE '%rodrigo%lopez%' OR LOWER(full_name) LIKE '%rodrigo%lopez%';
UPDATE sales_reps SET all_time_revenue = 24827.96, updated_at = NOW() WHERE LOWER(display_name) LIKE '%george%gerdes%' OR LOWER(full_name) LIKE '%george%gerdes%';
UPDATE sales_reps SET all_time_revenue = 21419.00, updated_at = NOW() WHERE LOWER(display_name) LIKE '%jamal%washington%' OR LOWER(full_name) LIKE '%jamal%washington%';
UPDATE sales_reps SET all_time_revenue = 15272.30, updated_at = NOW() WHERE LOWER(display_name) LIKE '%aryk%smith%' OR LOWER(full_name) LIKE '%aryk%smith%';
UPDATE sales_reps SET all_time_revenue = 14625.50, updated_at = NOW() WHERE LOWER(display_name) LIKE '%jonathan%rivera%' OR LOWER(full_name) LIKE '%jonathan%rivera%';
UPDATE sales_reps SET all_time_revenue = 6722.61, updated_at = NOW() WHERE LOWER(display_name) LIKE '%fabrizio%gonzalez%' OR LOWER(full_name) LIKE '%fabrizio%gonzalez%';

-- Verify the updates
SELECT display_name, all_time_revenue
FROM sales_reps
WHERE all_time_revenue > 0
ORDER BY all_time_revenue DESC;

COMMIT;

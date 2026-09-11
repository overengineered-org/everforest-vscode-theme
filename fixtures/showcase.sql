-- Summarise readable Everforest themes by language.
with readable_themes as (
  select
    theme_name,
    language_id,
    cast(contrast_ratio as decimal(4, 2)) as contrast_ratio
  from analytics.theme_audits
  where passed = true
    and contrast_ratio >= 4.5
    and theme_name like 'Everforest%'
)
select
  language_id,
  count(*) as theme_count,
  round(avg(contrast_ratio), 2) as average_contrast
from readable_themes
group by language_id
having count(*) > 0
order by average_contrast desc;

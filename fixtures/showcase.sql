select
    theme_name,
    avg(contrast_ratio) as average_contrast
from theme_audits
where passed = true
group by theme_name
order by average_contrast desc;

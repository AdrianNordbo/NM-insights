-- NM Insights: redaktører for den delte publiseringskalenderen (kjøres etter 2026-10-21_planned_posts.sql).
-- Bytt ut DIN-EPOST med e-postadressen du logger inn i dashboardet med. Adressen står ikke i repoet; brukeren
-- hentes fra auth.users. Kan kjøres flere ganger. Flere redaktører: kjør på nytt med en annen adresse.

-- Kontroll først: hvilke brukere finnes?
-- select id, email, last_sign_in_at from auth.users order by last_sign_in_at desc nulls last;

insert into public.plan_editors (user_id, note)
select id, 'redaktør'
from auth.users
where lower(email) = lower('DIN-EPOST')
on conflict (user_id) do nothing;

-- Forventet: én rad.
select e.user_id, u.email, e.added_at from public.plan_editors e join auth.users u on u.id = e.user_id;

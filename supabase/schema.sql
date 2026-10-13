-- ============================================================
--  专八词汇测验 · Supabase 数据库脚本
--  用法：Supabase 后台 → SQL Editor → New query → 整段粘贴 → Run
--  可以重复执行，不会重复建表，也不会清掉已有数据。
-- ============================================================

-- ---------- 1. 用户资料 + 奖金统计（每个用户一行） ----------
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  nickname    text,
  wallet      integer not null default 0,   -- 累计奖金（虚拟，单位：元）
  best_money  integer not null default 0,   -- 单轮最高奖金
  best_score  integer not null default 0,   -- 新题闯关最高分
  rounds      integer not null default 0,   -- 已完成轮数
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 2. 单词学习进度（做过的题 + 错题本，都在这张表） ----------
--  只要这里有某个单词的记录，就代表“做过了”；
--  in_wrongbook = true 代表它现在在错题本里。
create table if not exists public.word_progress (
  user_id       uuid not null references auth.users(id) on delete cascade,
  word          text not null,                       -- 单词本身，如 bargain
  seen_count    integer not null default 0,          -- 一共做过几次
  right_count   integer not null default 0,          -- 答对几次
  wrong_count   integer not null default 0,          -- 答错几次
  right_streak  integer not null default 0,          -- 当前连续答对几次
  in_wrongbook  boolean not null default false,      -- 是否在错题本
  last_seen     timestamptz not null default now(),  -- 最近一次做这个词的时间
  primary key (user_id, word)
);
create index if not exists word_progress_wb_idx
  on public.word_progress (user_id, in_wrongbook);

-- ---------- 3. 每一轮的成绩记录 ----------
create table if not exists public.rounds (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  mode        text not null default 'new',   -- new = 新题闯关，wrong = 错题练习
  score       integer not null,
  total       integer not null,
  money       integer not null default 0,
  max_streak  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists rounds_user_time_idx
  on public.rounds (user_id, created_at desc);

-- ---------- 4. 行级安全（RLS）：每个人只能读写自己的数据 ----------
alter table public.profiles       enable row level security;
alter table public.word_progress  enable row level security;
alter table public.rounds         enable row level security;

drop policy if exists "own profile"  on public.profiles;
drop policy if exists "own progress" on public.word_progress;
drop policy if exists "own rounds"   on public.rounds;

create policy "own profile" on public.profiles
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own progress" on public.word_progress
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rounds" on public.rounds
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete
  on public.profiles, public.word_progress, public.rounds to authenticated;

-- ---------- 5. 注册时自动创建一行 profiles ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, nickname)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 6. 函数：记录一次作答（原子更新，顺便处理错题本规则） ----------
--  规则：答错 → 进错题本，连对清零
--        答对 → 连对 +1；如果在错题本里且连续答对 ≥ 2 次 → 移出错题本
--  想改成“连对 3 次才移出”，把下面的 2 改成 3（前端 app.js 顶部的 MASTER 也要同步改）
create or replace function public.record_answer(p_word text, p_correct boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not logged in';
  end if;
  if p_word is null or length(p_word) = 0 or length(p_word) > 80 then
    raise exception 'bad word';
  end if;

  insert into public.word_progress
    (user_id, word, seen_count, right_count, wrong_count, right_streak, in_wrongbook, last_seen)
  values
    (auth.uid(), p_word, 1,
     case when p_correct then 1 else 0 end,
     case when p_correct then 0 else 1 end,
     case when p_correct then 1 else 0 end,
     not p_correct,
     now())
  on conflict (user_id, word) do update set
    seen_count   = word_progress.seen_count + 1,
    right_count  = word_progress.right_count + (case when p_correct then 1 else 0 end),
    wrong_count  = word_progress.wrong_count + (case when p_correct then 0 else 1 end),
    right_streak = case when p_correct then word_progress.right_streak + 1 else 0 end,
    in_wrongbook = case
                     when not p_correct then true
                     when word_progress.right_streak + 1 >= 2 then false
                     else word_progress.in_wrongbook
                   end,
    last_seen    = now();
end;
$$;

-- ---------- 7. 函数：结算一轮（写成绩记录 + 累加奖金，一次完成） ----------
create or replace function public.finish_round(
  p_mode text, p_score integer, p_total integer, p_money integer, p_max_streak integer
)
returns public.profiles
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not logged in';
  end if;
  if p_mode not in ('new', 'wrong') then
    raise exception 'bad mode';
  end if;
  if p_total < 1 or p_total > 200 or p_score < 0 or p_score > p_total then
    raise exception 'bad score';
  end if;
  -- 简单防呆：单题最高 30 元 + 全对奖 100 元，超过就不是正常玩出来的
  if p_money < 0 or p_money > p_total * 30 + 100 then
    raise exception 'bad money';
  end if;

  insert into public.rounds (user_id, mode, score, total, money, max_streak)
  values (auth.uid(), p_mode, p_score, p_total, p_money, greatest(p_max_streak, 0));

  insert into public.profiles (user_id, wallet, best_money, best_score, rounds)
  values (auth.uid(), p_money, p_money,
          case when p_mode = 'new' then p_score else 0 end, 1)
  on conflict (user_id) do update set
    wallet     = profiles.wallet + excluded.wallet,
    best_money = greatest(profiles.best_money, excluded.best_money),
    best_score = case when p_mode = 'new'
                      then greatest(profiles.best_score, excluded.best_score)
                      else profiles.best_score end,
    rounds     = profiles.rounds + 1,
    updated_at = now()
  returning * into r;

  return r;
end;
$$;

-- 只允许登录用户调用这两个函数
revoke execute on function public.record_answer(text, boolean) from public, anon;
revoke execute on function public.finish_round(text, integer, integer, integer, integer) from public, anon;
grant  execute on function public.record_answer(text, boolean) to authenticated;
grant  execute on function public.finish_round(text, integer, integer, integer, integer) to authenticated;

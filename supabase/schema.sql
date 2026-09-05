-- Execute este arquivo no SQL Editor de um novo projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  category text not null,
  image text not null,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_name text not null,
  delivery_type text not null,
  address text not null default '',
  payment text not null,
  notes text not null default '',
  client_total numeric(10,2) not null,
  trusted_total numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  name text not null,
  quantity integer not null check (quantity > 0 and quantity <= 100),
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "catalogo publico" on public.products for select using (available = true or auth.role() = 'authenticated');
create policy "admin gerencia produtos" on public.products for all to authenticated using (true) with check (true);
create policy "admin consulta pedidos" on public.orders for select to authenticated using (true);
create policy "admin atualiza pedidos" on public.orders for update to authenticated using (true) with check (true);
create policy "admin consulta itens" on public.order_items for select to authenticated using (true);

create or replace function public.create_order(order_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_order_id uuid;
  new_code text;
  trusted numeric(10,2);
  result jsonb;
begin
  if coalesce(length(trim(order_payload->>'customerName')),0) < 2 then raise exception 'Informe seu nome.'; end if;
  if jsonb_array_length(order_payload->'items') = 0 then raise exception 'Carrinho vazio.'; end if;

  select coalesce(sum(p.price * greatest(1, least(100, (item->>'quantity')::int))),0)
    into trusted
    from jsonb_array_elements(order_payload->'items') item
    join public.products p on p.id = item->>'productId' and p.available = true;

  if trusted <= 0 then raise exception 'Nenhum produto válido no pedido.'; end if;
  new_code := 'SN' || right(floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,8);

  insert into public.orders(code,customer_name,delivery_type,address,payment,notes,client_total,trusted_total)
  values(new_code,trim(order_payload->>'customerName'),order_payload->>'deliveryType',coalesce(order_payload->>'address',''),order_payload->>'payment',coalesce(order_payload->>'notes',''),(order_payload->>'clientTotal')::numeric,trusted)
  returning id into new_order_id;

  insert into public.order_items(order_id,product_id,name,quantity,unit_price,subtotal)
  select new_order_id,p.id,p.name,greatest(1,least(100,(item->>'quantity')::int)),p.price,p.price*greatest(1,least(100,(item->>'quantity')::int))
  from jsonb_array_elements(order_payload->'items') item
  join public.products p on p.id=item->>'productId' and p.available=true;

  select jsonb_build_object('id',o.id,'code',o.code,'customerName',o.customer_name,'deliveryType',o.delivery_type,'address',o.address,'payment',o.payment,'notes',o.notes,'clientTotal',o.client_total,'trustedTotal',o.trusted_total,'status',o.status,'createdAt',o.created_at,'items',coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal)),'[]'::jsonb))
  into result from public.orders o left join public.order_items i on i.order_id=o.id where o.id=new_order_id group by o.id;
  return result;
end;
$$;

grant execute on function public.create_order(jsonb) to anon, authenticated;

create or replace view public.orders_with_items with (security_invoker=true) as
select o.*,coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal)) filter (where i.id is not null),'[]'::jsonb) items
from public.orders o left join public.order_items i on i.order_id=o.id group by o.id;

insert into public.products(id,name,description,price,category,image,available) values
('long-neck','Cerveja Long Neck 330ml','Garrafa individual, entregue bem gelada.',6.00,'Cervejas','assets/produtos/cerveja-long-neck.webp',true),
('pack-6','Pack Cerveja — 6 latas','Seis latas geladas para compartilhar.',30.00,'Cervejas','assets/produtos/cerveja-6-latas.webp',true),
('cola-2l','Refrigerante Cola 2L','Garrafa de 2 litros, sabor cola.',12.00,'Refrigerantes','assets/produtos/refrigerante-cola-2l.webp',true),
('laranja-2l','Refrigerante Laranja 2L','Garrafa de 2 litros, sabor laranja.',10.00,'Refrigerantes','assets/produtos/refrigerante-laranja-2l.webp',true),
('agua-20l','Água Mineral 20L','Garrafão de água mineral. Consulte sobre vasilhame.',15.00,'Água','assets/produtos/agua-mineral-20l.webp',true),
('energetico-duo','Combo Energético — 2 latas','Duas latas de energético bem geladas.',16.00,'Energéticos','assets/produtos/energetico-duo.webp',true)
on conflict (id) do nothing;

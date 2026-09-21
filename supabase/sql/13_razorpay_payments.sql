-- Sunflora — move the checkout from Paytm to Razorpay.
--
-- The orders table only ever had Paytm-shaped payment columns (paytm_order_id,
-- paytm_txn_id) and a payment_method that defaulted to 'paytm'. Razorpay hands
-- back a different set of references, and the signature it returns to the
-- browser is worth keeping alongside them: it is the proof that a given
-- payment really was ours, and re-checking it later needs the original value.
--
-- The paytm_* columns are deliberately LEFT IN PLACE. Orders that were paid
-- through Paytm still carry their gateway references there, and dropping the
-- columns would erase the only record of how those payments can be traced,
-- refunded or reconciled with Paytm. Nothing writes to them any more.

alter table public.orders
  add column if not exists razorpay_order_id   text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature  text;

-- razorpay-webhook falls back to this lookup when an event carries no
-- notes.db_order_id, so it needs to be an index rather than a seq scan.
create index if not exists orders_razorpay_order_id_idx
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists orders_razorpay_payment_id_idx
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

-- New orders are Razorpay orders. create-order sets this explicitly too; the
-- default is what protects any other insert path from silently claiming Paytm.
alter table public.orders
  alter column payment_method set default 'razorpay';

-- Existing rows keep payment_method = 'paytm'. Every one of them (3 paid, 6
-- failed, 20 pending as of this migration) carries a paytm_order_id, so they
-- really were Paytm attempts and relabelling them would misreport history.
-- The 26 unpaid ones become payable again through Razorpay from the tracking
-- page; razorpay-initiate rewrites payment_method on the row when that happens.

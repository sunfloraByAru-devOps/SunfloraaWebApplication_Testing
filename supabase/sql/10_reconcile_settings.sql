-- Make site_settings tell the truth.
--
-- These rows were placeholders that no page ever read, so the dashboard was
-- showing the shop owner values that had nothing to do with her live site
-- ("Your desk misses / something alive" when the homepage actually says
-- "Crochet that feels like home"). Before wiring the storefront to read this
-- table, the values have to match what the site renders today - otherwise
-- connecting them would visibly change the homepage to placeholder text.
--
-- Safe to re-run.

begin;

update public.site_settings set value = 'Crochet that',
       label = 'Homepage headline — first line'
 where key = 'hero_headline_line1';

-- The component renders the last word of this line in the accent style, which
-- is how "home" is emphasised today.
update public.site_settings set value = 'feels like home',
       label = 'Homepage headline — second line'
 where key = 'hero_headline_line2';

update public.site_settings
   set value = 'Soft toys, flower bouquets & cozy keepsakes — each one stitched by hand, just for you.',
       label = 'Homepage headline — the line underneath'
 where key = 'hero_subtext';

-- The site links to instagram.com/sunfloraa.a in 12 places. "sunflora.craft"
-- was never used anywhere.
update public.site_settings set value = 'sunfloraa.a',
       label = 'Instagram handle (without the @)'
 where key = 'instagram_handle';

update public.site_settings set label = 'Contact email address'
 where key = 'email_address';

update public.site_settings set label = 'WhatsApp number (country code, no +)'
 where key = 'whatsapp_number';

update public.site_settings set label = 'Delivery charge in rupees'
 where key = 'shipping_fee_domestic';

update public.site_settings set label = 'Free delivery above this order value'
 where key = 'free_shipping_above';

commit;

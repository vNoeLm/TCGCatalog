-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.sets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code character varying NOT NULL UNIQUE,
  name character varying NOT NULL,
  release_date date,
  total_cards integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  game character varying NOT NULL DEFAULT 'palworld'::character varying,
  CONSTRAINT sets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL,
  card_number character varying NOT NULL,
  name character varying NOT NULL,
  rarity character varying NOT NULL,
  card_type character varying NOT NULL,
  cost integer CHECK (cost IS NULL OR cost >= 0),
  image_path character varying,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  subtype text,
  text text,
  game character varying NOT NULL DEFAULT 'palworld'::character varying,
  energy character varying,
  might character varying,
  domain character varying,
  tags jsonb DEFAULT '[]'::jsonb,
  ability text,
  artist character varying,
  market_price_eur numeric,
  market_price_foil_eur numeric,
  last_price_updated_at timestamp with time zone,
  is_archived boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  effect text,
  might_bonus integer,
  CONSTRAINT cards_pkey PRIMARY KEY (id),
  CONSTRAINT cards_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sets(id)
);
CREATE TABLE public.inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  condition character varying NOT NULL,
  is_foil boolean DEFAULT false,
  price_huf numeric CHECK (price_huf >= 0::numeric),
  status character varying NOT NULL DEFAULT 'In Stock'::character varying CHECK (status::text = ANY (ARRAY['In Stock'::character varying, 'Reserved'::character varying, 'On Hold'::character varying, 'Sold'::character varying, 'Archived'::character varying]::text[])),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_bulk boolean NOT NULL DEFAULT false,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  is_archived boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  CONSTRAINT inventory_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id)
);
CREATE TABLE public.inventory_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL,
  image_path character varying NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT inventory_images_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_images_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id)
);
CREATE TABLE public.settings (
  key text NOT NULL,
  value text NOT NULL,
  CONSTRAINT settings_pkey PRIMARY KEY (key)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email character varying,
  display_name character varying,
  avatar_url character varying,
  is_admin boolean NOT NULL DEFAULT false,
  role USER-DEFINED NOT NULL DEFAULT 'user'::user_role,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_banned boolean NOT NULL DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_number character varying NOT NULL UNIQUE,
  user_id uuid,
  status character varying NOT NULL DEFAULT 'Pending'::character varying,
  total_price_huf numeric NOT NULL DEFAULT 0 CHECK (total_price_huf >= 0::numeric),
  shipping_name character varying,
  shipping_address text,
  tracking_number character varying,
  courier_name character varying,
  shipping_label_url text,
  invoice_number character varying,
  invoice_status character varying,
  invoice_url text,
  payment_method character varying DEFAULT 'stripe'::character varying,
  payment_status character varying DEFAULT 'pending'::character varying,
  payment_id text,
  notes text,
  cancellation_reason text,
  cancelled_at timestamp with time zone,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.hold_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid,
  buyer_name character varying NOT NULL,
  buyer_email character varying NOT NULL,
  buyer_phone character varying,
  buyer_discord character varying,
  preferred_handover character varying NOT NULL DEFAULT 'foxpost'::character varying,
  handover_details character varying,
  message text,
  status character varying NOT NULL DEFAULT 'pending'::character varying,
  card_name character varying,
  card_number character varying,
  image_path text,
  price_huf integer,
  is_foil boolean DEFAULT false,
  condition character varying DEFAULT 'Near Mint'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  quantity integer NOT NULL DEFAULT 1,
  items jsonb,
  conversation_id uuid,
  CONSTRAINT hold_requests_pkey PRIMARY KEY (id),
  CONSTRAINT hold_requests_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory(id),
  CONSTRAINT hold_requests_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES auth.users(id),
  CONSTRAINT hold_requests_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id),
  CONSTRAINT hold_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.user_collections (
  user_id uuid NOT NULL,
  cards jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT user_collections_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.games (
  id character varying NOT NULL,
  name character varying NOT NULL,
  icon_url character varying,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT games_pkey PRIMARY KEY (id)
);
CREATE TABLE public.seller_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  order_number character varying NOT NULL,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  buyer_name character varying,
  buyer_avatar text,
  CONSTRAINT seller_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT seller_reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT seller_reviews_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id),
  CONSTRAINT seller_reviews_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES auth.users(id)
);
CREATE TABLE public.hold_request_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hold_request_id uuid,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  conversation_id uuid,
  message_type character varying NOT NULL DEFAULT 'user'::character varying,
  metadata jsonb,
  CONSTRAINT hold_request_messages_pkey PRIMARY KEY (id),
  CONSTRAINT hold_request_messages_hold_request_id_fkey FOREIGN KEY (hold_request_id) REFERENCES public.hold_requests(id),
  CONSTRAINT hold_request_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id),
  CONSTRAINT hold_request_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id),
  CONSTRAINT conversations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES auth.users(id)
);
CREATE TABLE public.search_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  query text NOT NULL,
  game character varying,
  context character varying NOT NULL DEFAULT 'catalog'::character varying,
  card_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT search_events_pkey PRIMARY KEY (id),
  CONSTRAINT search_events_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id)
);
CREATE TABLE public.public_decks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name character varying NOT NULL,
  game character varying NOT NULL DEFAULT 'riftbound'::character varying,
  deck jsonb NOT NULL,
  legend_card_id uuid,
  champion_card_id uuid,
  is_public boolean NOT NULL DEFAULT true,
  views integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT public_decks_pkey PRIMARY KEY (id),
  CONSTRAINT public_decks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT public_decks_legend_card_id_fkey FOREIGN KEY (legend_card_id) REFERENCES public.cards(id),
  CONSTRAINT public_decks_champion_card_id_fkey FOREIGN KEY (champion_card_id) REFERENCES public.cards(id)
);
CREATE TABLE public.card_price_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  card_id uuid NOT NULL,
  price_eur numeric,
  price_foil_eur numeric,
  recorded_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT card_price_history_pkey PRIMARY KEY (id),
  CONSTRAINT card_price_history_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id)
);
-- 「股票数据」页用户列模板
CREATE TABLE public.user_stock_data_template (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 name VARCHAR(60) NOT NULL,
 columns JSONB NOT NULL,
 symbols JSONB,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX user_stock_data_template_user_id_name_key ON public.user_stock_data_template(user_id, name);

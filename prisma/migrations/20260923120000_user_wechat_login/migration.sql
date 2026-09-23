-- 微信开放平台扫码登录：User 绑定 openid / unionid
ALTER TABLE "public"."User" ADD COLUMN "wechat_openid" TEXT;
ALTER TABLE "public"."User" ADD COLUMN "wechat_unionid" TEXT;
ALTER TABLE "public"."User" ADD COLUMN "wechat_nickname" TEXT;
ALTER TABLE "public"."User" ADD COLUMN "wechat_bound_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_wechat_openid_key" ON "public"."User"("wechat_openid");
CREATE UNIQUE INDEX "User_wechat_unionid_key" ON "public"."User"("wechat_unionid");

-- Bucket único para imagens E áudios: question-media
-- ============================================================================
-- Rode no SQL Editor do Supabase (não há CLI). Depende de 0001_init.sql.
--
-- Antes: o bucket `question-images` guardava só as imagens enviadas pelo painel
-- /questions. Agora os áudios (voz neural) também moram no Storage, no mesmo
-- bucket, sob o prefixo `audio/` (ex.: audio/<id>.mp3). Renomeamos o bucket para
-- `question-media` para o nome refletir os dois tipos de mídia.
--
-- Endereçamento: o áudio é lido publicamente (a criança não faz login) em
--   {NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-media/audio/<id>.mp3
-- e o `image_key` da pergunta guarda a URL pública da imagem.

-- Cria o bucket novo (idempotente).
insert into storage.buckets (id, name, public)
  values ('question-media', 'question-media', true)
  on conflict (id) do nothing;

-- Leitura pública: imagem e áudio aparecem na avaliação, sem login.
drop policy if exists "question_media_public_read" on storage.objects;
create policy "question_media_public_read" on storage.objects
  for select using (bucket_id = 'question-media');

-- Envio/troca só por aplicador autenticado (imagens pelo painel; áudios pelo
-- botão "Regerar áudio" e pelo script).
drop policy if exists "question_media_auth_write" on storage.objects;
create policy "question_media_auth_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'question-media')
  with check (bucket_id = 'question-media');

-- Reaponta as imagens já salvas para o bucket novo. As imagens do import inicial
-- são estáticas (/public/images) e não têm URL de Storage, então não casam com o
-- LIKE — só as enviadas pelo painel (URL pública de question-images) são
-- reescritas. É no-op se você ainda não enviou nenhuma imagem customizada.
update public.questions
  set image_key = replace(image_key, '/question-images/', '/question-media/')
  where image_key like '%/question-images/%';

-- ATENÇÃO: se você JÁ tinha enviado imagens customizadas, os OBJETOS ainda estão
-- no bucket antigo `question-images`. Mova-os para `question-media` (arrastar no
-- painel do Storage, ou copiar via script com service role) — senão a URL
-- reescrita acima aponta para um objeto que não existe. Sem imagens enviadas,
-- ignore. O bucket antigo pode ser removido depois de migrar/confirmar.

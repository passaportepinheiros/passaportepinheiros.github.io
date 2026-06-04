# Passaporte Pinheiros

Este repositório contém o site estático do Passaporte Pinheiros, feito com Astro Content Collections e Tailwind CSS.

As experiências ficam cadastradas em Markdown com frontmatter e podem ser editadas pelo Pages CMS.

## Estrutura

```txt
src/content/experiencias/
  produtos/*.md
  restaurantes/*.md
  servicos/*.md

public/experiencias/
  produtos/{slug}/experiencia.jpg
  produtos/{slug}/logo.png
  restaurantes/{slug}/experiencia.jpg
  restaurantes/{slug}/logo.png
  servicos/{slug}/experiencia.jpg
  servicos/{slug}/logo.png
```

Os arquivos Markdown ficam em `src/content/experiencias`, que é a fonte para o Astro. As imagens ficam em `public/experiencias`, para serem servidas diretamente por URL.

Exemplo de frontmatter:

```yaml
title: "Beer4u"
slug: "beer4u"
category: "restaurantes"
instagram: "beer4upinheiros"
instagramUrl: "https://www.instagram.com/beer4upinheiros/"
enderecos:
  - logradouro: "Rua João Moura"
    numero: "595"
    telefones:
      - tipo: "telefone"
        numero: "11932453531"
        formatado: "(11) 93245-3531"
description: |-
  1º Carimbo:
  ...
images:
  experience: "/experiencias/restaurantes/beer4u/experiencia.jpg"
  logo: "/experiencias/restaurantes/beer4u/logo.png"
```

O schema da collection está em `src/content.config.ts`.

Os endereços digitados manualmente ficam no frontmatter em `enderecos`. Cada item possui `logradouro`, `numero`, `complemento` opcional e uma lista de `telefones`. O campo `numero` do telefone usa apenas dígitos com DDD; `formatado` é a versão para exibição; `tipo` pode ser `telefone` ou `whatsapp`.

Experiências novas podem começar como rascunhos sem `description` e sem `images`. O site exibe um texto de atualização nesses casos, e os campos podem ser completados depois pelo Pages CMS.

## Site Astro

O site usa Astro Content Collections e Tailwind CSS. Para rodar localmente:

```sh
pnpm install
pnpm dev
```

O servidor local abre em:

```txt
http://localhost:4321
```

Para gerar a versão estática:

```sh
pnpm build
```

Para validar os arquivos Astro e TypeScript:

```sh
pnpm check
```

## Enriquecimento com Google Places

O fluxo do Google Places existe apenas para descobrir e revisar `googlePlaceId`.
Não gravamos descrição, horários, fotos, telefones ou outros dados retornados pelo Google Places no conteúdo do site.

1. Configure a chave no `.env`:

```sh
GOOGLE_PLACES_API_KEY="sua-chave"
```

2. Gere o relatório de candidatos:

```sh
pnpm places:find
```

Esse comando cria dois arquivos locais em `data/`:

- `data/google-places-place-ids.generated.json`, com o relatório completo;
- `data/google-places-place-ids.generated.csv`, para revisão manual.

Esses relatórios são locais, ignorados pelo Git e podem ser recriados quando necessário.

3. Abra o CSV e revise principalmente linhas com `confidence` igual a `medium`, `low`, `not-found` ou `error`.

Para confirmar uma linha, preencha:

- `confirmado`: use `sim`;
- `placeIdConfirmado`: deixe vazio para usar `googlePlaceId`, ou informe outro Place ID quando o candidato sugerido estiver errado;
- `observacoes`: opcional, para registrar qualquer ajuste.

Se você já tiver o JSON e quiser apenas recriar o CSV sem chamar a API:

```sh
pnpm places:find -- --from-json data/google-places-place-ids.generated.json
```

4. Depois de confirmar as linhas desejadas, grave apenas os IDs nos markdowns:

```sh
pnpm places:apply-ids
```

Esse comando não chama a API; ele lê o CSV revisado e grava somente `googlePlaceId` no frontmatter das experiências confirmadas.

Rotas principais:

- `/` lista todas as experiências com busca e filtros;
- `/restaurantes`, `/produtos` e `/servicos` abrem a lista filtrada por categoria;
- `/{slug}` abre a página de detalhe;
- `/como-funciona` mostra uma página institucional simples.

## Deploy no GitHub Pages

O deploy está em `.github/workflows/deploy.yml`. Antes de publicar, o workflow verifica se o GitHub Pages está habilitado e se a fonte está configurada como GitHub Actions; se não estiver, ele mantém o build rodando e pula apenas o deploy para evitar o erro 404 de `actions/deploy-pages`.

Para habilitar no GitHub:

1. Abra `Settings > Pages`.
2. Em `Build and deployment`, selecione `Source: GitHub Actions`.
3. Rode novamente o workflow `Deploy to GitHub Pages`.

## Pages CMS

Este repositório também está configurado para edição pelo Pages CMS, usando o arquivo `.pages.yml` na raiz.

Para usar:

1. Publique este repositório no GitHub.
2. Acesse <https://app.pagescms.org>.
3. Entre com sua conta do GitHub.
4. Autorize o Pages CMS no repositório.
5. Edite as experiências em `Experiencias > Produtos`, `Experiencias > Restaurantes` ou `Experiencias > Servicos`.

O CMS permite criar, editar, renomear e apagar experiências. Cada collection grava os arquivos em `src/content/experiencias/{categoria}` usando o `slug` como nome do Markdown.

As imagens enviadas pelo CMS são gravadas em:

```txt
public/experiencias/produtos/
public/experiencias/restaurantes/
public/experiencias/servicos/
```

O Pages CMS salva alterações como commits no próprio repositório.

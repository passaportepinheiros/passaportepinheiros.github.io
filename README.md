# Passaporte Pinheiros - Conteúdo das Experiências

Este repositório transforma cards do Instagram do Passaporte Pinheiros em uma base de conteúdo pronta para um site com Astro Content Collections.

O processamento extrai, para cada card:

- foto da experiência;
- logo da empresa;
- metadados em Markdown com frontmatter;
- links públicos para as imagens geradas.

## Estrutura

```txt
data/instagram/
  produtos/
  restaurantes/
  servicos/

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

Exemplo de campos gerados:

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

Ao rodar `process_images.py`, o bloco `enderecos` já existente é preservado para evitar perder dados cadastrados manualmente.

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

Rotas principais:

- `/` lista todas as experiências com busca e filtros;
- `/restaurantes`, `/produtos` e `/servicos` abrem a lista filtrada por categoria;
- `/experiencias/{categoria}/{slug}` abre a página de detalhe;
- `/como-funciona` mostra uma página institucional simples.

## Pages CMS

Este repositório também está configurado para edição pelo Pages CMS, usando o arquivo `.pages.yml` na raiz.

Para usar:

1. Publique este repositório no GitHub.
2. Acesse <https://app.pagescms.org>.
3. Entre com sua conta do GitHub.
4. Autorize o Pages CMS no repositório.
5. Edite as experiências em `Experiencias > Produtos`, `Experiencias > Restaurantes` ou `Experiencias > Servicos`.

Nesta primeira configuração, o CMS permite editar os campos e trocar imagens, mas não permite criar, renomear ou apagar experiências. Isso evita quebrar a relação entre `slug`, nome do arquivo e metadados gerados pelo `process_images.py`.

As imagens enviadas pelo CMS são gravadas em:

```txt
public/experiencias/produtos/
public/experiencias/restaurantes/
public/experiencias/servicos/
```

O Pages CMS salva alterações como commits no próprio repositório.

## Pré-requisitos

O script usa ferramentas locais:

- Python 3;
- ImageMagick, com o comando `magick` disponível no terminal;
- Tesseract OCR, apenas se você rodar com `--no-curated`.

No macOS com Homebrew:

```sh
brew install imagemagick tesseract
```

## Como rodar o processamento

Para processar todos os cards:

```sh
python3 process_images.py
```

Para simular sem escrever arquivos:

```sh
python3 process_images.py --dry-run
```

Para processar apenas uma categoria:

```sh
python3 process_images.py restaurantes
python3 process_images.py produtos
python3 process_images.py servicos
```

Para ignorar a tabela curada de metadados e tentar ler tudo via OCR local:

```sh
python3 process_images.py --no-curated
```

## Entrada Esperada

Coloque os cards `.webp` nestas pastas:

```txt
data/instagram/produtos/
data/instagram/restaurantes/
data/instagram/servicos/
```

Cada card deve seguir o layout atual:

- foto no topo;
- logo abaixo da foto;
- nome da empresa;
- texto da experiência;
- arroba do Instagram na horizontal ou vertical.

## Saída Gerada

Depois de rodar o script, cada experiência terá:

- um Markdown em `src/content/experiencias/{categoria}/{slug}.md`;
- uma foto em `public/experiencias/{categoria}/{slug}/experiencia.jpg`;
- um logo em `public/experiencias/{categoria}/{slug}/logo.png`.

O `slug` é gerado a partir do nome da empresa.

## Notas

O script contém uma tabela curada para os cards atuais em `KNOWN_CARDS`. Isso evita depender de API externa e corrige pequenas falhas comuns de OCR, principalmente em arrobas escritos na vertical.

Para cards novos, existem dois caminhos:

- adicionar a entrada correspondente em `KNOWN_CARDS`;
- ou rodar com `--no-curated` e revisar manualmente os Markdown gerados.

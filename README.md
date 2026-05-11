# Lead Hunter

Ferramenta de prospecção B2B que coleta leads automaticamente do Google Maps, valida os números de celular e dispara mensagens pelo WhatsApp Web — tudo rodando localmente, sem APIs pagas.

---

## Índice

1. [Como funciona](#como-funciona)
2. [Tecnologias utilizadas](#tecnologias-utilizadas)
3. [Estrutura do projeto](#estrutura-do-projeto)
4. [Instalação e configuração](#instalação-e-configuração)
5. [Como usar](#como-usar)
6. [Detalhamento técnico](#detalhamento-técnico)
7. [Variáveis de ambiente](#variáveis-de-ambiente)
8. [Limitações e cuidados](#limitações-e-cuidados)

---

## Como funciona

O fluxo completo é dividido em três etapas:

```
[1] Busca no Google Maps
        ↓
    Playwright abre o browser, pesquisa o nicho + cidade,
    faz scroll automático e extrai nome, telefone, site
    e link do Google Meu Negócio.

[2] Validação de celular
        ↓
    Cada número encontrado é limpo e validado como celular
    brasileiro (DDD + dígito 9). Fixos e inválidos são descartados.

[3] Disparo via WhatsApp Web
        ↓
    O Playwright abre o WhatsApp Web com sessão salva em disco.
    Para cada número, navega até wa.me/send?phone=..., aguarda o
    compositor aparecer e clica em Enviar. Um intervalo de 15s
    entre mensagens evita bloqueios.
```

---

## Tecnologias utilizadas

| Tecnologia | Versão | Finalidade |
|---|---|---|
| **Next.js** | 16.x | Framework full-stack (App Router) |
| **React** | 19.x | UI declarativa com hooks |
| **TypeScript** | 5.x | Tipagem estática em todo o projeto |
| **Tailwind CSS** | 4.x | Estilização utilitária |
| **Playwright** | 1.x | Automação de browser (scraping + WhatsApp) |
| **Lucide React** | — | Ícones SVG |

O backend roda inteiramente dentro das **Route Handlers** do Next.js (arquivos `route.ts`), sem necessidade de um servidor separado. O Playwright executa no processo Node.js do servidor Next.js.

---

## Estrutura do projeto

```
lead-hunter/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Página principal (UI completa)
│   │   ├── layout.tsx                  # Layout raiz com fonte e metadados
│   │   ├── globals.css                 # Estilos globais + fundo gradiente
│   │   └── api/
│   │       ├── scraper/
│   │       │   └── route.ts            # POST /api/scraper — executa o scraping
│   │       └── whatsapp/
│   │           └── send/
│   │               └── route.ts        # POST/GET/PATCH /api/whatsapp/send
│   ├── components/
│   │   ├── SearchForm.tsx              # Formulário de nicho + localização
│   │   └── LeadsTable.tsx              # Tabela de leads com seleção e status
│   ├── lib/
│   │   ├── scraper.ts                  # Lógica de scraping com Playwright
│   │   ├── phone.ts                    # Validação e normalização de celulares BR
│   │   ├── locations.ts                # Lista de estados e cidades brasileiras
│   │   └── webhook.ts                  # Utilitário de webhook (uso opcional)
│   └── types/
│       └── lead.ts                     # Interfaces TypeScript: Lead, RawLead, etc.
├── .whatsapp-session/                  # Sessão do WhatsApp (gerada automaticamente, no .gitignore)
├── .env.local                          # Variáveis de ambiente (não versionado)
└── package.json
```

---

## Instalação e configuração

### Pré-requisitos

- Node.js 18+ (recomendado: 20 LTS)
- npm ou outro package manager
- Sistema com interface gráfica (o WhatsApp Web abre uma janela visível)

### Passos

```bash
# 1. Clone o repositório
git clone git@github.com:BryanJohn2901/lead_wp.git
cd lead_wp

# 2. Instale as dependências
npm install

# 3. Instale o browser do Playwright
npx playwright install chromium

# 4. (Opcional) Crie o arquivo de variáveis de ambiente
# Crie um arquivo .env.local na raiz — veja a seção "Variáveis de ambiente"

# 5. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse **http://localhost:3000** no navegador.

---

## Como usar

### 1. Buscar leads

1. No formulário, selecione um **nicho** da lista ou digite livremente (ex: `Clínica odontológica`)
2. Escolha o **estado** e a **cidade**
3. Clique em **Iniciar Busca**

O Playwright abre um browser invisível em segundo plano, acessa o Google Maps, faz scroll automático e coleta os estabelecimentos encontrados. Ao término, os leads aparecem na tabela abaixo.

> A busca leva alguns segundos — o browser precisa navegar e carregar os resultados do Maps reais.

---

### 2. Entender os metric cards

Após a busca, quatro cards de métricas aparecem acima da tabela:

| Card | O que mostra |
|---|---|
| **Encontrados** | Total de leads com celular válido coletados |
| **Descartados** | Estabelecimentos sem telefone ou com número fixo |
| **Sem site** | Leads que não têm site próprio (oportunidade de venda) |
| **Selecionados** | Quantidade de leads atualmente marcados na tabela |

---

### 3. Filtrar e selecionar leads

- Clique em **"Filtrar sem site"** para exibir apenas os leads sem website — esse é o público-alvo ideal para serviços de criação de sites ou presença digital
- Marque leads clicando diretamente nas linhas da tabela ou nos checkboxes individuais
- O checkbox no **cabeçalho da tabela** seleciona ou desmarca todos de uma vez

---

### 4. Carregar mais leads

Clique em **"Carregar mais"** para buscar mais 30 resultados da mesma pesquisa. Os novos leads são mesclados com os anteriores sem duplicatas (deduplicação por telefone).

---

### 5. Exportar CSV

Clique em **"Baixar CSV"** para exportar todos os leads com as colunas:

```
Empresa | Telefone | Site | LinkGoogleMeuNegocio | TemSite | StatusEnvio
```

O arquivo é gerado direto no navegador, sem passar pelo servidor, com encoding UTF-8 BOM para compatibilidade com Excel.

---

### 6. Disparar mensagens pelo WhatsApp

1. Clique em **"Começar envio"** para abrir o painel de disparo
2. No campo **"Números para disparo"**, clique em:
   - **"Usar todos os leads"** — preenche com todos os números da tabela atual
   - **"Usar X selecionados"** — preenche apenas com os leads marcados
   - Ou cole / edite os números manualmente (aceita qualquer formato: `(41) 99999-9999`, `41999999999`, `+5541999999999`)
3. Escreva a **mensagem** no campo ao lado
4. Clique em **"Começar envios"**

#### O que acontece nos bastidores:

- Um browser Chromium abre de forma **visível** (não headless) com o WhatsApp Web
- **Primeira vez**: um QR Code é exibido na janela — você tem até **2 minutos** para escanear com o celular
- A sessão é salva na pasta `.whatsapp-session/` — nas próximas vezes o login é automático
- Para cada número, o bot navega até `web.whatsapp.com/send?phone=...`, aguarda o compositor de mensagens e clica em Enviar
- Entre cada mensagem há um intervalo fixo de **15 segundos** para reduzir risco de bloqueio

#### Controles do envio:

| Botão | Ação |
|---|---|
| **Pausar** | Pausa o envio e congela o timer de 15s |
| **Continuar** | Retoma de onde parou |
| **Parar** | Encerra o job após o número atual ser processado |

#### Barra de progresso:

Exibe em tempo real: mensagens enviadas, falhas, restantes e qual número está sendo processado no momento. Ao concluir, a tabela de leads é atualizada com o status **Enviado** (verde) ou **Falhou** (vermelho) para cada contato.

---

## Detalhamento técnico

### Scraper (`src/lib/scraper.ts`)

O scraper usa Playwright no modo **headless** (sem janela visível):

1. Abre o Google Maps com a query `{nicho} {cidade} {estado}`
2. Aceita o dialog de cookies do Google automaticamente, se aparecer
3. Aguarda o feed de resultados (`div[role="feed"]`)
4. Faz scroll no feed a cada 2,5s até atingir o limite de resultados (`maxResults`) ou o final da lista
5. Para cada card (`div.Nv2PK`), extrai via `page.$$eval`:
   - **Nome**: seletor `.qBF1Pd` ou atributo `aria-label` do link
   - **Telefone**: regex `\(?\d{2}\)?\s?\d?\s?\d{4}[-\s]?\d{4}` aplicada no texto do card
   - **Site**: link `a[data-value="Website"]`
   - **Link Google Meu Negócio**: link `a.hfpxzc`

Se o número de cards não aumentar em 5 iterações consecutivas, o scraper considera que chegou ao fim e encerra.

---

### Validação de telefone (`src/lib/phone.ts`)

Três funções em cadeia:

```typescript
sanitizePhone(raw)
// Remove tudo que não é dígito
// "(41) 99876-5432" → "41998765432"

isBrazilianMobile(digits)
// Verifica: 11 dígitos, DDD entre 11–99, terceiro dígito = "9"
// "41998765432" → true
// "4134567890"  → false (fixo)

normalizePhone(raw)
// Retorna "+55XXXXXXXXXXX" ou null se inválido
// "(41) 99876-5432" → "+5541998765432"
// "(41) 3456-7890"  → null
```

Números fixos e inválidos são contabilizados como "descartados" e não aparecem na tabela.

---

### API de scraping (`POST /api/scraper`)

**Corpo da requisição:**
```json
{ "niche": "Barbearia", "location": "Curitiba PR", "maxResults": 30 }
```

**Resposta:**
```json
{
  "leads": [
    {
      "name": "Barbearia Exemplo",
      "phone": "+5541999999999",
      "hasWebsite": false,
      "websiteUrl": null,
      "googleBusinessUrl": "https://maps.google.com/...",
      "sentStatus": "pending"
    }
  ],
  "total": 24,
  "discarded": 6
}
```

O timeout máximo da rota é de **300 segundos** (`maxDuration = 300`), suficiente para buscas grandes.

---

### API do WhatsApp (`/api/whatsapp/send`)

Três métodos HTTP na mesma rota:

**`POST`** — Inicia um job de envio
```json
// Requisição
{ "numbers": ["+5541999999999", "+5511988888888"], "message": "Olá, tudo bem?" }

// Resposta
{ "jobId": "job_1716000000000_abc123" }
```

**`GET ?jobId=...`** — Consulta o progresso (frontend faz polling a cada 1,5s)
```json
{
  "jobId": "job_...",
  "status": "running",
  "total": 10,
  "processed": 3,
  "sent": 2,
  "failed": 1,
  "remaining": 7,
  "currentPhone": "+5541999999999",
  "waitingQrScan": false,
  "paused": false
}
```

**`PATCH`** — Controla o job em andamento
```json
{ "jobId": "job_...", "action": "pause" }   // ou "resume" ou "stop"
```

Os jobs ficam em memória no `globalThis` do servidor. O limite é de 20 jobs armazenados; os mais antigos são removidos automaticamente. A sessão do WhatsApp é mantida com `launchPersistentContext()` apontando para `.whatsapp-session/`.

---

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz:

```env
# Número máximo de resultados por busca (padrão: 30)
SCRAPER_MAX_RESULTS=50

# Endpoint de webhook para receber leads (opcional)
WEBHOOK_URL=https://seu-webhook.exemplo.com/leads
```

O app funciona sem nenhuma variável configurada — os valores padrão são usados automaticamente.

---

## Limitações e cuidados

- **Uso local apenas**: o Playwright abre browsers reais com GUI. Não funciona em ambientes serverless (Vercel Free, Netlify, etc.) sem configuração especial.
- **Seletores do Google Maps**: o Google altera o HTML do Maps sem aviso. Se o scraping parar de funcionar, os seletores em `scraper.ts` precisam ser revisados.
- **Seletores do WhatsApp Web**: o WhatsApp também atualiza sua interface com frequência. Os seletores estão em `route.ts` na seção de constantes no topo do arquivo.
- **Intervalo de 15s**: não reduza esse valor sem testes — disparos muito rápidos aumentam o risco de bloqueio temporário do número no WhatsApp.
- **Sessão do WhatsApp**: a pasta `.whatsapp-session/` está no `.gitignore`. Nunca envie essa pasta para o repositório — ela contém dados de autenticação sensíveis.
- **Escopo de validação**: o app valida apenas celulares **brasileiros**. Números internacionais são descartados.

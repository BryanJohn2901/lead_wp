"use client";

import { Briefcase, Loader2, MapPin, Search } from "lucide-react";
import { FormEvent, useState } from "react";
import { STATES, CITIES_BY_STATE } from "@/lib/locations";

interface SearchFormProps {
  onSubmit: (niche: string, location: string) => void;
  isLoading: boolean;
}

const NICHE_OPTIONS: string[] = [
  "Clínica de estética",
  "Clínica odontológica",
  "Academia",
  "Pet shop",
  "Restaurante",
  "Barbearia",
  "Salão de beleza",
  "Clínica veterinária",
  "Advogado",
  "Imobiliária",
  "Pizzaria",
  "Hamburgueria",
  "Lanchonete",
  "Cafeteria",
  "Padaria",
  "Confeitaria",
  "Sorveteria",
  "Açaíteria",
  "Marmitaria",
  "Buffet",
  "Churrascaria",
  "Comida japonesa",
  "Comida árabe",
  "Comida italiana",
  "Adega",
  "Distribuidora de bebidas",
  "Mercado",
  "Supermercado",
  "Mini mercado",
  "Hortifruti",
  "Loja de conveniência",
  "Farmácia",
  "Drogaria",
  "Loja de suplementos",
  "Loja de produtos naturais",
  "Loja de cosméticos",
  "Perfumaria",
  "Loja de roupas",
  "Loja de calçados",
  "Loja infantil",
  "Loja de bijuterias",
  "Joalheria",
  "Ótica",
  "Papelaria",
  "Livraria",
  "Loja de brinquedos",
  "Loja de informática",
  "Assistência técnica de celular",
  "Assistência técnica de notebook",
  "Eletrônica",
  "Loja de eletrodomésticos",
  "Loja de móveis",
  "Marcenaria",
  "Serralheria",
  "Vidraçaria",
  "Marmoraria",
  "Material de construção",
  "Loja de tintas",
  "Casa de ferragens",
  "Casa de ração",
  "Pet shop com banho e tosa",
  "Clínica médica",
  "Clínica de fisioterapia",
  "Clínica de psicologia",
  "Clínica de nutrição",
  "Clínica de fonoaudiologia",
  "Clínica de pilates",
  "Estúdio de pilates",
  "Estúdio de yoga",
  "Crossfit",
  "Estúdio funcional",
  "Personal trainer",
  "Escola de dança",
  "Escola de música",
  "Escola de idiomas",
  "Curso profissionalizante",
  "Creche",
  "Escola particular",
  "Autoescola",
  "Despachante",
  "Contabilidade",
  "Consultoria financeira",
  "Correspondente bancário",
  "Seguradora",
  "Corretora de seguros",
  "Marketing digital",
  "Agência de publicidade",
  "Gráfica rápida",
  "Comunicação visual",
  "Produtora de vídeo",
  "Fotógrafo",
  "Filmagem para eventos",
  "Buffet infantil",
  "Decoração de festas",
  "Locação de brinquedos",
  "Cerimonialista",
  "Espaço para eventos",
  "Hotel",
  "Pousada",
  "Hostel",
  "Agência de viagens",
  "Locadora de veículos",
  "Lavacar",
  "Estética automotiva",
  "Oficina mecânica",
  "Auto elétrica",
  "Centro automotivo",
  "Funilaria e pintura",
  "Borracharia",
  "Troca de óleo",
  "Guincho",
  "Mecânico de moto",
  "Loja de autopeças",
  "Bicicletaria",
  "Chaveiro",
  "Dedetizadora",
  "Desentupidora",
  "Limpeza de estofados",
  "Lavanderia",
  "Tinturaria",
  "Costureira",
  "Ateliê de moda",
  "Salão de unhas",
  "Designer de sobrancelhas",
  "Depilação",
  "Clínica de harmonização facial",
  "Massoterapia",
  "Spa",
  "Tattoo studio",
  "Estúdio de piercing",
  "Consultório odontológico",
  "Laboratório de análises clínicas",
  "Clínica de imagem",
  "Casa de repouso",
  "Fisioterapia domiciliar",
  "Home care",
  "Cooperativa de saúde",
  "Distribuidora",
  "Atacado",
  "Transportadora",
  "Mudanças",
  "Motoboy",
  "Logística",
  "Serviço de entrega",
  "Coworking",
  "Escritório compartilhado",
  "Loja de embalagens",
  "Loja de utilidades",
  "Assistência técnica de ar-condicionado",
  "Instalação de ar-condicionado",
  "Eletricista",
  "Encanador",
  "Pintor residencial",
  "Gesseiro",
  "Instalador de drywall",
  "Jardinagem",
  "Paisagismo",
  "Piscineiro",
  "Segurança eletrônica",
  "Instalação de câmeras",
  "Monitoramento",
  "Loja de colchões",
  "Loja de cortinas",
  "Persianas",
  "Tapeçaria",
  "Armarinhos",
  "Bazar",
  "Casa lotérica",
  "Lan house",
  "Loja de games",
  "Assistência de impressoras",
  "Recarga de cartuchos",
  "Clínica de reabilitação",
  "Psicopedagogia",
  "Terapia ocupacional",
];

const SELECT_BASE =
  "w-full cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:shadow-none dark:focus:border-emerald-500 dark:focus:ring-0 [&>option]:bg-white dark:[&>option]:bg-zinc-900 [&>option]:text-zinc-900 dark:[&>option]:text-zinc-100";

const SELECT_DISABLED =
  "w-full cursor-not-allowed rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-400 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600 [&>option]:bg-white dark:[&>option]:bg-zinc-900";

export function SearchForm({
  onSubmit,
  isLoading,
}: SearchFormProps): React.JSX.Element {
  const [niche, setNiche] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");

  const cities = selectedState ? (CITIES_BY_STATE[selectedState] ?? []) : [];
  const nicheIsFromList = NICHE_OPTIONS.includes(niche);

  const handleStateChange = (abbr: string): void => {
    setSelectedState(abbr);
    setSelectedCity("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const nicheTrimmed = niche.trim();
    if (!nicheTrimmed || !selectedState || !selectedCity) return;
    onSubmit(nicheTrimmed, `${selectedCity} ${selectedState}`);
  };

  const isDisabled = isLoading || !niche.trim() || !selectedState || !selectedCity;

  return (
    <form
      onSubmit={handleSubmit}
      className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none"
    >
      {/* gradient top accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />

      <div className="grid gap-6 p-6 md:grid-cols-2">

        {/* ── Nicho ── */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            <Briefcase className="h-3.5 w-3.5" />
            Nicho / Serviço
          </label>

          <select
            value={nicheIsFromList ? niche : ""}
            onChange={(e) => setNiche(e.target.value)}
            className={SELECT_BASE}
          >
            <option value="" disabled>Selecione um nicho da lista...</option>
            {NICHE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-within:border-emerald-500/70">
            <Briefcase className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Ou digite livremente..."
              className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
          </div>
        </div>

        {/* ── Localização ── */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            <MapPin className="h-3.5 w-3.5" />
            Localização
          </label>

          <div className="space-y-1.5">
            <p className="text-xs text-zinc-400 dark:text-zinc-600">Estado</p>
            <select
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
              className={SELECT_BASE}
            >
              <option value="" disabled>Selecione o estado...</option>
              {STATES.map((state) => (
                <option key={state.abbr} value={state.abbr}>{state.name} ({state.abbr})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className={`text-xs transition ${selectedState ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-300 dark:text-zinc-700"}`}>
              Cidade
            </p>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              disabled={!selectedState}
              className={selectedState ? SELECT_BASE : SELECT_DISABLED}
            >
              <option value="" disabled>
                {selectedState ? "Selecione a cidade..." : "Selecione o estado primeiro"}
              </option>
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Submit ── */}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
        <button
          type="submit"
          disabled={isDisabled}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {isLoading ? "Buscando..." : "Iniciar Busca"}
        </button>

        {selectedCity && selectedState && niche ? (
          <span className="text-right text-xs text-zinc-400 dark:text-zinc-500">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">{niche}</span>
            {" · "}
            {selectedCity}/{selectedState}
          </span>
        ) : null}
      </div>
    </form>
  );
}

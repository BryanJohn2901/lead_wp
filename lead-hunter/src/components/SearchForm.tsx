"use client";

import { Briefcase, Loader2, MapPin, Search } from "lucide-react";
import { FormEvent, useState } from "react";

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

export function SearchForm({
  onSubmit,
  isLoading,
}: SearchFormProps): React.JSX.Element {
  const [niche, setNiche] = useState<string>("");
  const [location, setLocation] = useState<string>("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const nicheTrimmed = niche.trim();
    const locationTrimmed = location.trim();
    if (!nicheTrimmed || !locationTrimmed) {
      return;
    }

    onSubmit(nicheTrimmed, locationTrimmed);
  };

  const isDisabled = isLoading || !niche.trim() || !location.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-zinc-300">Nicho/Serviço</span>
          <select
            value=""
            onChange={(event) => setNiche(event.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
          >
            <option value="" disabled>
              Selecione um nicho rápido
            </option>
            {NICHE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
            <Briefcase className="h-4 w-4 text-zinc-500" />
            <input
              value={niche}
              onChange={(event) => setNiche(event.target.value)}
              placeholder="Ex: Clínica Odontológica"
              className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-sm text-zinc-300">Localização</span>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
            <MapPin className="h-4 w-4 text-zinc-500" />
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Ex: Curitiba PR"
              className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </div>
        </label>
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        Iniciar Busca
      </button>
    </form>
  );
}

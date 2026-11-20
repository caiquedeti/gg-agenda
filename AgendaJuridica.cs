using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Globalization;

namespace AgendaAdvogados
{
    /// <summary>
    /// Resultado de uma operação da agenda (substitui as mensagens que antes iam para o Console).
    /// </summary>
    public record ResultadoOperacao(bool Sucesso, string Mensagem, bool Conflito = false);

    public class AgendaJuridica
    {
        // Trava simples: a agenda é única (singleton) e a Web atende várias requisições ao mesmo tempo.
        private readonly object trava = new object();

        private List<Compromisso> compromissos = new List<Compromisso>();
        private List<string> advogados = new List<string>
            {
                "Dr. Carlos Mendes",
                "Dra. Fernanda Rocha"
            };

        private List<string> clientes = new List<string>
            {
                "João Silva",
                "Empresa Alfa Ltda"
            };

        private List<string> processos = new List<string>
            {
                "0001234-56.2026.8.13.0024",
                "0009876-54.2026.8.13.0024"
            };

        private List<string> modalidades = new List<string>
            {
                "Presencial",
                "Remota"
            };

        // ===================== Listas (antes exibidas em SelecionarDaLista) =====================

        public List<string> Advogados { get { lock (trava) return new List<string>(advogados); } }
        public List<string> Clientes { get { lock (trava) return new List<string>(clientes); } }
        public List<string> Processos { get { lock (trava) return new List<string>(processos); } }
        public List<string> Modalidades { get { lock (trava) return new List<string>(modalidades); } }

        // ===================== Novo Agendamento =====================

        /// <summary>
        /// Mesmas regras do CadastrarCompromisso do Console, recebendo os valores já digitados
        /// (data em DD/MM/AAAA ou AAAA-MM-DD, horas em HH:MM).
        /// </summary>
        public ResultadoOperacao CadastrarCompromisso(string? advogado, string? titulo, string? cliente,
            string? numeroProcesso, string? modalidade, string? data, string? horaInicio, string? horaFim)
        {
            lock (trava)
            {
                if (advogados.Count == 0 || clientes.Count == 0 || processos.Count == 0)
                {
                    return new ResultadoOperacao(false, "É necessário cadastrar pelo menos um advogado, um cliente e um processo no menu de Administração antes de agendar.");
                }

                Compromisso novaFicha = new Compromisso();
                string? erro;

                if ((erro = SelecionarDaLista(advogados, "Advogado", advogado, out string adv)) != null) return Falha(erro);
                novaFicha.Advogado = adv;

                if ((erro = LerTextoObrigatorio(titulo, "Título", out string tit)) != null) return Falha(erro);
                novaFicha.Titulo = tit;

                if ((erro = SelecionarDaLista(clientes, "Cliente", cliente, out string cli)) != null) return Falha(erro);
                novaFicha.Cliente = cli;

                if ((erro = SelecionarDaLista(processos, "Processo", numeroProcesso, out string proc)) != null) return Falha(erro);
                novaFicha.NumeroProcesso = proc;

                if ((erro = SelecionarDaLista(modalidades, "Modalidade", modalidade, out string mod)) != null) return Falha(erro);
                novaFicha.Modalidade = mod;

                if (!LerData(data, out DateTime dataValida))
                    return Falha("Erro: Data inválida ou inexistente! Use o formato DD/MM/AAAA.");
                novaFicha.Data = dataValida;

                if (novaFicha.Data < DateTime.Today)
                    return Falha("Erro: Não é possível agendar compromissos em datas passadas!");

                if (!LerHora(horaInicio, out TimeSpan inicio))
                    return Falha("Erro: Horário de início inválido! Use o formato HH:MM (ex: 14:30).");
                if (!LerHora(horaFim, out TimeSpan fim))
                    return Falha("Erro: Horário de fim inválido! Use o formato HH:MM (ex: 14:30).");
                novaFicha.HoraInicio = inicio;
                novaFicha.HoraFim = fim;

                if (novaFicha.HoraFim <= novaFicha.HoraInicio)
                    return Falha("Erro: A hora de fim deve ser maior que a hora de início!");

                if (TemConflito(novaFicha.Advogado, novaFicha.Data, novaFicha.HoraInicio, novaFicha.HoraFim))
                {
                    return new ResultadoOperacao(false, "Erro: Já existe um compromisso para este advogado neste horário!", Conflito: true);
                }

                compromissos.Add(novaFicha);
                return new ResultadoOperacao(true, "Sucesso: Compromisso agendado com sucesso!");
            }
        }

        private static ResultadoOperacao Falha(string mensagem) => new ResultadoOperacao(false, mensagem);

        private string? LerTextoObrigatorio(string? texto, string nomeCampo, out string valor)
        {
            valor = "";
            if (string.IsNullOrWhiteSpace(texto))
            {
                return $"Erro: O campo {nomeCampo} é obrigatório e não pode ficar em branco!";
            }

            valor = texto.Trim();
            return null;
        }

        public bool LerData(string? texto, out DateTime dataValida)
        {
            // DD/MM/AAAA era o formato do Console; AAAA-MM-DD é o que o <input type="date"> envia.
            string[] formatos = { "dd/MM/yyyy", "yyyy-MM-dd" };
            return DateTime.TryParseExact(texto?.Trim(), formatos, CultureInfo.InvariantCulture, DateTimeStyles.None, out dataValida);
        }

        public bool LerHora(string? texto, out TimeSpan horaValida)
        {
            string[] formatos = { @"h\:mm", @"hh\:mm" };
            return TimeSpan.TryParseExact(texto?.Trim(), formatos, CultureInfo.InvariantCulture, out horaValida);
        }

        // ===================== Consultar Compromissos =====================

        /// <summary>
        /// Lista todos, ou filtra por Data e/ou Advogado (mesmas comparações do Console).
        /// </summary>
        public (List<Compromisso> Itens, int TotalAgendados, int Encontrados) ListarCompromissos(DateTime? dataBuscada, string? advogadoBuscado)
        {
            lock (trava)
            {
                List<Compromisso> resultado = new List<Compromisso>();

                foreach (Compromisso itemAtual in compromissos)
                {
                    if (dataBuscada.HasValue && itemAtual.Data != dataBuscada.Value.Date)
                        continue;

                    if (!string.IsNullOrWhiteSpace(advogadoBuscado) &&
                        !string.Equals(itemAtual.Advogado, advogadoBuscado, StringComparison.OrdinalIgnoreCase))
                        continue;

                    resultado.Add(itemAtual);
                }

                return (resultado, compromissos.Count, resultado.Count);
            }
        }

        private bool TemConflito(string Advogado, DateTime Data, TimeSpan HoraInicio, TimeSpan HoraFim)
        {
            foreach (Compromisso itemAtual in compromissos)
            {
                if (string.Equals(itemAtual.Advogado, Advogado, StringComparison.OrdinalIgnoreCase) && itemAtual.Data == Data)
                {
                    if (HoraInicio < itemAtual.HoraFim && HoraFim > itemAtual.HoraInicio)
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// Equivale à escolha numérica do Console: o valor precisa existir na lista.
        /// </summary>
        private string? SelecionarDaLista(List<string> lista, string nomeCampo, string? escolhido, out string valor)
        {
            valor = "";
            if (string.IsNullOrWhiteSpace(escolhido))
            {
                return $"Erro: O campo {nomeCampo} é obrigatório e não pode ficar em branco!";
            }

            int indice = lista.FindIndex(x => x == escolhido.Trim());
            if (indice < 0)
            {
                return $"Erro: Opção inválida para {nomeCampo}! Selecione um item da lista.";
            }

            valor = lista[indice];
            return null;
        }

        // ===================== Administração =====================

        public ResultadoOperacao CadastrarAdvogado(string? nome) => Cadastrar(advogados, nome, "nome do advogado", "Advogado");
        public ResultadoOperacao CadastrarProcesso(string? numero) => Cadastrar(processos, numero, "número do processo", "Processo");
        public ResultadoOperacao CadastrarCliente(string? nome) => Cadastrar(clientes, nome, "nome do cliente", "Cliente");

        private ResultadoOperacao Cadastrar(List<string> lista, string? texto, string nomeCampo, string rotulo)
        {
            lock (trava)
            {
                string? erro = LerTextoObrigatorio(texto, nomeCampo, out string valor);
                if (erro != null) return Falha(erro);

                lista.Add(valor);
                return new ResultadoOperacao(true, $"✅ {rotulo} cadastrado com sucesso!");
            }
        }

        // ===================== Exportação CSV =====================

        /// <summary>
        /// Gera o agenda.csv (separador ";", cabeçalho, UTF-8 com BOM — o mesmo que
        /// new StreamWriter(..., Encoding.UTF8) gravava) e devolve os bytes para download.
        /// Retorna null quando não há compromissos (no Console a exportação só era alcançável com a agenda preenchida).
        /// </summary>
        public byte[]? ExportarParaCSV()
        {
            lock (trava)
            {
                if (compromissos.Count == 0) return null;

                using MemoryStream ms = new MemoryStream();
                using (StreamWriter sw = new StreamWriter(ms, Encoding.UTF8))
                {
                    sw.WriteLine("Advogado;Titulo;Cliente;Processo;Modalidade;Data;HoraInicio;HoraFim");

                    foreach (Compromisso itemAtual in compromissos)
                    {
                        sw.WriteLine($"{itemAtual.Advogado};{itemAtual.Titulo};{itemAtual.Cliente};{itemAtual.NumeroProcesso};{itemAtual.Modalidade};{itemAtual.Data.ToString("dd/MM/yyyy")};{itemAtual.HoraInicio.ToString(@"hh\:mm")};{itemAtual.HoraFim.ToString(@"hh\:mm")}");
                    }
                }

                return ms.ToArray();
            }
        }
    }
}

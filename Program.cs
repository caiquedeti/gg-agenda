using System;
using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Unicode;

namespace AgendaAdvogados
{
    // Corpo das requisições (JSON) enviadas pelo front-end
    public record NovoCompromissoRequest(string? Advogado, string? Titulo, string? Cliente, string? NumeroProcesso,
        string? Modalidade, string? Data, string? HoraInicio, string? HoraFim);

    public record CadastroRequest(string? Nome);

    class Program
    {
        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;

            var builder = WebApplication.CreateBuilder(args);

            // Uma única agenda em memória para toda a aplicação (como no Console).
            builder.Services.AddSingleton<AgendaJuridica>();

            // Mantém acentos legíveis no JSON
            builder.Services.ConfigureHttpJsonOptions(o =>
                o.SerializerOptions.Encoder = JavaScriptEncoder.Create(UnicodeRanges.All));

            var app = builder.Build();

            app.UseDefaultFiles();
            app.UseStaticFiles();

            var api = app.MapGroup("/api");

            // Listas para os <select> (Advogado, Cliente, Processo, Modalidade)
            api.MapGet("/listas", (AgendaJuridica agenda) => Results.Ok(new
            {
                advogados = agenda.Advogados,
                clientes = agenda.Clientes,
                processos = agenda.Processos,
                modalidades = agenda.Modalidades
            }));

            // Listar / filtrar compromissos: /api/compromissos?data=2026-12-01&advogado=Dr. Carlos Mendes
            api.MapGet("/compromissos", (string? data, string? advogado, AgendaJuridica agenda) =>
            {
                DateTime? dataBuscada = null;
                if (!string.IsNullOrWhiteSpace(data))
                {
                    if (!agenda.LerData(data, out DateTime d))
                        return Results.BadRequest(new { sucesso = false, mensagem = "Erro: Data inválida ou inexistente! Use o formato DD/MM/AAAA." });
                    dataBuscada = d;
                }

                var (itens, total, encontrados) = agenda.ListarCompromissos(dataBuscada, advogado);

                return Results.Ok(new
                {
                    totalAgendados = total,
                    totalEncontrados = encontrados,
                    itens = itens.Select(c => new
                    {
                        advogado = c.Advogado,
                        titulo = c.Titulo,
                        cliente = c.Cliente,
                        numeroProcesso = c.NumeroProcesso,
                        modalidade = c.Modalidade,
                        data = c.Data.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                        dataFormatada = c.Data.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
                        horaInicio = c.HoraInicio.ToString(@"hh\:mm"),
                        horaFim = c.HoraFim.ToString(@"hh\:mm")
                    })
                });
            });

            // Novo agendamento
            api.MapPost("/compromissos", (NovoCompromissoRequest req, AgendaJuridica agenda) =>
            {
                var r = agenda.CadastrarCompromisso(req.Advogado, req.Titulo, req.Cliente, req.NumeroProcesso,
                    req.Modalidade, req.Data, req.HoraInicio, req.HoraFim);

                var corpo = new { sucesso = r.Sucesso, mensagem = r.Mensagem };
                if (r.Sucesso) return Results.Created("/api/compromissos", corpo);
                return r.Conflito ? Results.Conflict(corpo) : Results.BadRequest(corpo);
            });

            // Administração
            api.MapPost("/advogados", (CadastroRequest req, AgendaJuridica agenda) => Responder(agenda.CadastrarAdvogado(req.Nome)));
            api.MapPost("/clientes", (CadastroRequest req, AgendaJuridica agenda) => Responder(agenda.CadastrarCliente(req.Nome)));
            api.MapPost("/processos", (CadastroRequest req, AgendaJuridica agenda) => Responder(agenda.CadastrarProcesso(req.Nome)));

            // Exportação: download direto do agenda.csv
            api.MapGet("/exportar", (AgendaJuridica agenda) =>
            {
                byte[]? arquivo = agenda.ExportarParaCSV();
                if (arquivo == null)
                    return Results.BadRequest(new { sucesso = false, mensagem = "Não há compromissos na agenda!" });

                return Results.File(arquivo, "text/csv; charset=utf-8", "agenda.csv");
            });

            app.Run();
        }

        private static IResult Responder(ResultadoOperacao r)
        {
            var corpo = new { sucesso = r.Sucesso, mensagem = r.Mensagem };
            return r.Sucesso ? Results.Created("", corpo) : Results.BadRequest(corpo);
        }
    }
}

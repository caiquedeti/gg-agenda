using System;

namespace AgendaAdvogados
{
    public class Compromisso
    {
        public string Advogado { get; set; } = "";
        public string Titulo { get; set; } = "";
        public string Cliente { get; set; } = "";
        public string NumeroProcesso { get; set; } = "";
        public string Modalidade { get; set; } = "";
        public DateTime Data { get; set; }
        public TimeSpan HoraInicio { get; set; }
        public TimeSpan HoraFim { get; set; }
    }
}
# ---------- Etapa 1: compila e publica ----------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish "g&g-agenda.csproj" -c Release -o /app

# ---------- Etapa 2: imagem final (só o runtime) ----------
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .

# Horário de Brasília: a regra "não agendar no passado" usa DateTime.Today
ENV TZ=America/Sao_Paulo
ENV ASPNETCORE_ENVIRONMENT=Production

# Render/Railway/Dokploy informam a porta pela variável PORT (padrão 8080 fora deles)
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} exec dotnet 'g&g-agenda.dll'"]

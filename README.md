- PROJETO
  CIPC_RAD

- COPYRIGHT@


- VERSIONAMENTO


- ARQUITETURA DO SISTEMA

cipc_rad (processamento)
   ↓
/home/jurandir/cipc_output
   ├── geotiff
   ├── cog
   ├── tiles
   └── figures

cipc_rad_web (Flask)
   ↓
consome /cipc_output
   ↓
Nginx (opcional depois)
   ↓
Docker + CI/CD


- DADOS DE ENTRADA
  ~/cipc_data

- DADOS DE SAIDA
  ~/cipc_output

- DADOS CONSUMIDOS PELO FRONTEND
  ~/cipc_output

- Inicialização do Sistema 
  cd /home/jurandir/cipc_rad_web
  docker compose up -d --build

- Para desligar/desativar
   docker compose down

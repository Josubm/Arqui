# 1. Instalar dependencias de pruebas
cd services/auth && npm install --save-dev jest supertest
cd ../professionals && npm install --save-dev jest supertest
cd ../booking && npm install --save-dev jest supertest
cd ../../gateway && npm install --save-dev jest supertest

# 2. Ejecutar pruebas específicas
cd services/auth && npm test
cd ../professionals && npm test

# 3. Ejecutar todas las pruebas
./run-tests.sh

# 4. Ejecutar con cobertura
cd services/auth && npm run test:coverage

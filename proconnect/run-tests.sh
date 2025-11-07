#!/bin/bash

echo "🧪 Ejecutando todas las pruebas..."

echo "1. Ejecutando pruebas de Auth Service..."
cd services/auth && npm test

echo "2. Ejecutando pruebas de Professionals Service..."
cd ../professionals && npm test

echo "3. Ejecutando pruebas de Booking Service..."
cd ../booking && npm test

echo "4. Ejecutando pruebas de Gateway..."
cd ../../gateway && npm test

echo "✅ Todas las pruebas completadas!"

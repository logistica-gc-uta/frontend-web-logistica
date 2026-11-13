# Evidencia · Issue #34 (parte 2) — Venta ADMIN a un cliente con cuenta

Completa la #34. La parte de invitado (pago declarado, comprobante imprimible, corrección de contacto) se entregó en el
PR #44 con su evidencia `34-compra-admin.md`. Esta parte habilita **Cliente con cuenta** en _Nueva venta_: el ADMIN
busca la cuenta por nombre o correo y la venta queda en el historial de ese cliente.

- **Issue:** [#34](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/34)
- **Fecha de ejecución:** 13/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `1e36c3b` (incluye #64, `docs/admin-clients-contract.md`)
- **Frontend:** rama `feat/34-cliente-registrado` (desde `main` @ `66bc4ce`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker), base aislada

## 1. Contrato usado (backend #64 y #45)

| Llamada                          | Uso en la web                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/clients`             | `search` (2–100, nombre o correo, sin distinguir mayúsculas), `page`, `pageSize` 20. Solo cuentas CLIENT; devuelve `id`, `name`, `email`. |
| `POST /orders/admin`             | `buyer: { type: 'REGISTERED_CLIENT', clientId, contactPhone }`; el nombre y el correo los toma el servidor de la cuenta.                  |
| Rechazos del backend (en inglés) | 404 `Registered client not found` y 400 `Registered owner must be a CLIENT` → se traducen.                                                |

Las cuentas no guardan teléfono, por eso no se busca por teléfono y el teléfono del comprador se escribe en cada venta.

## 2. Qué cambió

| Pieza                    | Detalle                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adminClientsService`    | Búsqueda paginada; el texto se recorta y solo se envía desde 2 caracteres.                                                                                                                                                                                                                                                 |
| `ClientPicker` (nuevo)   | Buscador _Buscar cliente por nombre o correo_: espera 300 ms tras la última tecla, descarta respuestas de búsquedas anteriores, lista resultados con _Elegir_, _Ver más clientes_ por páginas, aviso sin coincidencias (sugiere registrarlo como invitado), error con _Reintentar_. Cliente elegido con _Cambiar cliente_. |
| Formulario _Nueva venta_ | _Cliente con cuenta_ habilitado; con cuenta se oculta el nombre escrito y se explica que el teléfono no está en la cuenta. Cambiar entre invitado y cliente no borra lo escrito.                                                                                                                                           |
| Validación y envío       | Con cuenta exige elegirla (_Busca y elige la cuenta del cliente_) y el teléfono; envía solo `clientId` y `contactPhone`. El destinatario aparte sigue igual.                                                                                                                                                               |
| Comprobante              | Sin cambios: ya muestra el correo de la cuenta y, en clientes con cuenta, solo deja corregir el teléfono (no el nombre).                                                                                                                                                                                                   |

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **788/789 PASS**; la única
  diferencia es la prueba que lee justamente la URL de la API configurada.
- Nuevas: `RegisteredBuyer.test.tsx` (6): búsqueda desde 2 letras y envío con `clientId`, venta sin cuenta elegida no se
  envía, cambiar de cliente o volver a invitado sin perder datos, sin coincidencias y _Ver más_, error con _Reintentar_,
  cuenta inexistente sin comprobante ficticio. Además en `orderValidation.test.ts` (validación y cuerpo con cuenta) y
  `purchaseErrors.test.ts` (traducción de los dos rechazos).

### 3.2 Integración contra el backend real

`src/integration/registeredBuyer.int.test.ts` → **6/6 PASS**. Crea su propio cliente con un nombre único:

| Caso                           | Resultado real                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Buscar por nombre y por correo | Encuentra solo esa cuenta con `id`, `name`, `email`; buscar `admin@delivery` no devuelve el ADMIN.                 |
| Paginación                     | Páginas de 20.                                                                                                     |
| Venta con la cuenta elegida    | Comprobante con nombre y correo de la cuenta y el teléfono de la venta; aparece en su historial (`source: ADMIN`). |
| Regalo para otra persona       | Comprador (cuenta) y destinatario quedan separados en el comprobante.                                              |
| Cuenta inexistente             | Mensaje _la cuenta del cliente ya no existe_; no se registra nada.                                                 |
| CLIENT busca clientes          | 403.                                                                                                               |

Suite completa de integración: **13 archivos PASS, 91 pruebas PASS, 10 omitidas** (urgencias e incidencias, porque se
ejecutó de noche, fuera del horario de reparto 07:00–17:00).

### 3.3 Verificación en el navegador

Como ADMIN de la semilla en _Pedidos → Nueva venta_: al elegir _Cliente con cuenta_ aparece el buscador; con «ana»
lista _Ana Cliente · client1@delivery.com_; al elegirla queda el recuadro con _Cambiar cliente_. Con «cliente» llegan
20 resultados (una página). Sin errores en consola.

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Fuera de alcance

Crear o editar cuentas de clientes desde el panel, buscar por teléfono (las cuentas no lo guardan) y enviar el
comprobante por mensajería (se comparte por fuera).

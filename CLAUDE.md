# Daymart CRM — Memoria del proyecto

> Nota técnica: este proyecto usa Next.js. Antes de tocar código de Next.js, revisa `AGENTS.md` (reglas específicas del framework, se regenera solo).

## Quién es el usuario y cómo trabajar con él

Isaac, dueño de Daymart. **No sabe programar.** Reglas de trabajo obligatorias:

- Hablarle siempre en **español mexicano**, simple y directo, sin jerga técnica. Si se usa un término técnico, explicarlo ahí mismo.
- Antes de construir algo grande: proponer el plan y **esperar su "va"** antes de tocar código.
- Mostrar los cambios y pedir aprobación conforme se avanza. Ir paso a paso, sin adelantarse.
- Dar recomendaciones activamente, no solo ejecutar lo que pide. Si hay una mejor forma de hacer algo, decírselo.
- Si necesita instalar algo o correr comandos, guiarlo clic por clic. No asumir que sabe hacerlo.
- Le importa mucho la **portabilidad**: no quiere quedar atado a una tecnología. Por eso el stack elegido usa piezas estándar (ver abajo) — sus datos y su código deben ser exportables/movibles en cualquier momento, sin proveedor que lo tenga "secuestrado". Nada del sistema es definitivo: campos, pantallas y cálculos se pueden agregar/editar/quitar cuando Isaac lo pida, con el mismo proceso (mostrar el cambio, esperar su aprobación).

## El negocio

**Daymart** — e-commerce de importación. Isaac importa productos desde China (equipo de gym/fitness, artículos para el hogar, espejos, cocina, exteriores) y los revende en Mercado Libre y Amazon México. Negocio en crecimiento.

## Visión general del sistema

Un CRM/sistema de gestión propio para Daymart:

- Web app, responsive (se ve bien en compu y celular), sin apps que descargar.
- Diseño limpio, bonito, amigable y eficiente.
- Crece por módulos con el tiempo. Meta final: manejo de stock, conexión API con Mercado Libre (luego Amazon MX), ventas, y análisis.

### Stack elegido (aprobado por Isaac — "si va")

| Pieza | Qué es | Por qué |
|---|---|---|
| **Next.js** | Motor de la app web | Estándar de la industria, responsive automático (compu y celular) |
| **Supabase** | Base de datos (PostgreSQL) + login + almacenamiento de imágenes | Gratis para empezar, datos 100% exportables, formato estándar (Postgres) |
| **Vercel** | Hosting — donde "vive" la app en internet | Gratis para empezar, acceso vía link desde cualquier navegador, sin instalar nada |

**Principio de portabilidad:** todo el código vive en GitHub (propiedad de Isaac). La base de datos es PostgreSQL estándar, exportable en cualquier momento. Ninguna pieza es propietaria/cerrada — si aparece mejor tecnología, se puede migrar sin perder nada.

## Módulo 1 (en construcción): Pedidos / Contenedores

Flujo de "hacer un pedido en China". Todavía NADA de ventas, stock ni Mercado Libre (eso viene después).

Fuente de referencia: Excel "Proveedores Dale Click", hoja "Daymart". Se leyeron las fórmulas reales de los contenedores 10 al 15 (filas 244–313 aprox.; ya hay huecos preparados para 16, 17, 18).

### Estructura de dos niveles

**CONTENEDOR** (nivel 1):
- Número de contenedor (ej. 11, 12, 13...)
- Barco / booking (ej. MRKU2892234)
- Estado — campo editable por Isaac, con opciones fijas (visto en su Excel: RECEIVED, DEPOSIT PAID, FULLY PAID, DEPOSIT PAID 10K RECEIVED, EN TRÁNSITO — se definirá una lista corta y clara de estados)
- Gastos en 3 campos: **Flete**, **Aduana**, **Mercancía** (Mercancía es solo informativo/referencia — no se reparte por CBM, solo Flete+Aduana se reparten)
- Tipo de cambio del dólar, configurable por contenedor (ej. 18.5, 17.5 — cada contenedor el suyo, uno solo, sin variar dentro del mismo contenedor)
- Resumen calculado: costo por producto y costo total del contenedor

**PRODUCTO** (nivel 2, varios por contenedor):
- Categoría
- Fábrica (empresa: TOPKO, Union Chance, Zhoya...) y Proveedor/contacto (persona: Sarah Kuo, Fairy...) — ambos campos, contacto opcional
- Imagen del producto
- SKU: autogenerado (categoría + nombre, como su fórmula actual), editable a mano
- Nombre del producto (se usará para manejar stock más adelante)
- Cantidad
- Memo/detalles para el proveedor (color, código, comentario)
- Precio en dólares
- Piezas por caja (PC PER CTN)
- Medidas de la caja: largo, ancho, alto (cm)

### Cálculos (confirmados contra las fórmulas reales del Excel)

- **Cartones** = Cantidad ÷ Piezas por caja
- **CBM por producto** = (largo × ancho × alto en cm ÷ 1,000,000) × número de cartones
- **Total USD por producto** = precio USD × cantidad
- **Costo por CBM del contenedor** = (Flete + Aduana) ÷ CBM total real del contenedor
  *(Nota: en el Excel original esto a veces se dividía entre un número de CBM escrito a mano en vez del CBM real — en el sistema nuevo siempre se usa el CBM real, calculado automáticamente. Esto corrige un error manual que existía.)*
- **Gasto repartido por pieza** = (CBM del producto × Costo por CBM del contenedor) ÷ Cantidad del producto
- **Costo final por pieza (pesos)** = Gasto repartido por pieza + (Precio USD × tipo de cambio del contenedor)

### Decisiones ya tomadas

1. Fábrica Y proveedor/contacto: los dos campos, contacto opcional.
2. SKU autogenerado (categoría + nombre) pero editable a mano.
3. Gastos del contenedor en 3 campos: flete, aduana, mercancía.
4. Tipo de cambio configurable por contenedor (uno solo, no varía entre productos del mismo contenedor).
5. Mercancía es campo informativo, no se reparte por CBM.
6. Estado del contenedor: campo de primer nivel (por contenedor), con lista fija de opciones.

## Lo que se deja para después (NO hacer todavía)

- Estudio de mercado, predicción de ventas, comparación "cómo me fue vs. lo esperado".
- Detección de oportunidades / qué productos traer.
- Manejo de stock, ventas, conexión con Mercado Libre / Amazon MX.
- Migrar el histórico de contenedores anteriores al 10 (Isaac los borró del Excel por pesado; se agregarán después cuando el sistema esté listo).

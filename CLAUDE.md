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
- Booking (ej. MRKU2892234) — ya no se usa "barco", se quitó por petición de Isaac
- Estado — lista fija, en el orden real del proceso: Configurándose → En tránsito → Recibido en puerto → Liberado de aduana → Recibido en bodega
- **Flete**: en dólares, con su propio tipo de cambio (se paga de una sola vez)
- **Aduana**: en pesos, sin tipo de cambio (ya se cobra en pesos)
- **Mercancía**: se paga en varios abonos a lo largo del tiempo, cada uno puede tener un tipo de cambio distinto. Por ahora los abonos son por contenedor completo (no por producto individual — eso se dejará para un sistema de pagos más completo en el futuro). El sistema calcula solo el tipo de cambio promedio ponderado (total pesos ÷ total dólares de los abonos).
- **Fábrica/Proveedor principal**: campo a nivel contenedor. Rellena automáticamente el campo de cada producto nuevo (la mayoría de los contenedores son de un solo proveedor), pero se puede cambiar por producto si el contenedor es consolidado (varios proveedores). No se guarda como lista aparte — el resumen de "proveedores en este contenedor" se calcula solo, sacado de los productos reales.
- **Documentación** (pestaña aparte): checklist con 6 documentos fijos — Telex, Packing list (proveedor), Invoice (proveedor), Telex release, BL, HBL. Cada uno se sube como archivo (bucket privado de Supabase Storage, acceso con link firmado temporal). Barra de progreso (X de 6), se pone verde cuando está completo. Pensado para que, cuando haya login, el equipo de Isaac (aduanal, importación) pueda cargar/ver esto también con permisos — por ahora un solo usuario, sin permisos diferenciados todavía.
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
- **Flete en pesos** = Flete USD × tipo de cambio del flete
- **Tipo de cambio promedio de mercancía** = (suma de monto_USD × tipo_cambio de cada abono) ÷ (suma de monto_USD de todos los abonos)
- **Costo por CBM del contenedor** = (Flete en pesos + Aduana) ÷ CBM total real del contenedor
  *(Nota: en el Excel original esto a veces se dividía entre un número de CBM escrito a mano en vez del CBM real — en el sistema nuevo siempre se usa el CBM real, calculado automáticamente. Esto corrige un error manual que existía.)*
- **Gasto repartido por pieza** = (CBM del producto × Costo por CBM del contenedor) ÷ Cantidad del producto
- **Costo final por pieza (pesos)** = Gasto repartido por pieza + (Precio USD del producto × tipo de cambio promedio de mercancía)

### Decisiones ya tomadas

1. Fábrica Y proveedor/contacto: los dos campos, contacto opcional.
2. SKU autogenerado (categoría + nombre) pero editable a mano.
3. Gastos del contenedor: Flete (USD + su tipo de cambio), Aduana (pesos, sin tipo de cambio), Mercancía (abonos en USD, cada uno con su tipo de cambio, promedio ponderado calculado por el sistema).
4. El tipo de cambio "de los productos" es el promedio ponderado de los abonos de mercancía del contenedor — no un campo único fijo.
5. Abonos de mercancía por ahora son por contenedor completo, no por producto (eso se dejará para un sistema de pagos más adelante).
6. Estado del contenedor: campo de primer nivel (por contenedor), lista fija en el orden real del proceso (ver arriba).
7. Campo "Barco" eliminado — solo se usa Booking.
8. Vista de productos: tabla o galería (fotos), Isaac elige con un botón. Ambas muestran el costo final por pieza ya calculado.
9. Packing list: vista de impresión (usa "Imprimir → Guardar como PDF" del navegador, sin librería de PDF), con opción de "con precios" / "sin precios". Un PDF generado por el sistema con diseño propio (logo, etc.) se deja para más adelante si esta versión no basta.
10. Permisos/colaboradores todavía NO se construyen (no hay login). Isaac ya avisó que los quiere más adelante para que su equipo (aduanal, importación) pueda cargar documentos con permisos — dejarlo anotado como pendiente, no construir hasta que se hable con calma. Técnicamente no está "loco" — Supabase Auth ya trae login/roles integrado, es trabajo normal cuando se defina qué rol ve/edita qué.
11. Historial de fechas: cada vez que cambia el estado del contenedor (desde el menú rápido o el formulario grande), se guarda automático en una tabla de historial (`historial_estados_contenedor`). En el contenedor se muestra una línea de tiempo con la primera fecha en que se alcanzó cada estado.
12. Productos: se pueden editar todos sus campos (incluida la foto) después de creados, y se pueden reordenar a mano (subir/bajar) — el orden se guarda en la base de datos (columna `orden`), no es solo visual.
13. Restock: al agregar un producto, hay un selector "¿ya lo has traído antes?" con todos los productos de TODOS los contenedores (uno por SKU, el más reciente). Al elegir uno, se rellenan solos categoría/fábrica/proveedor/nombre/SKU/memo/precio/piezas/medidas/foto — la cantidad se deja vacía porque siempre cambia. Es cálculo directo sobre la tabla `productos` existente, no hay tabla de catálogo aparte todavía.
14. Subida de fotos: si falla, ya no se guarda en silencio — se le avisa a Isaac con el error exacto de Supabase Storage (antes el error se ignoraba, por eso los productos guardaban "sin foto" sin explicación).
15. "Otros gastos" del contenedor: campo opcional (dólares + su propio tipo de cambio), en un bloque desplegable cerrado por defecto (no siempre aplica). Para fletes internos en China u otros cargos. Se reparte por CBM junto con flete y aduana.
16. Borrar un contenedor NUNCA es inmediato: es información valiosa. Se pide escribir el número del contenedor para confirmar, y el borrado real es un "soft delete" (columna `eliminado_en`) — se manda a una Papelera (`/papelera`) de donde se puede Restaurar o Borrar definitivo (con la misma confirmación de escribir el número). Sin límite de tiempo/borrado automático — se queda ahí hasta que Isaac decida a propósito. La lista principal (`/`) filtra `eliminado_en is null`.
17. Límite de subida de archivos: Next.js Server Actions limitan el tamaño del formulario a 1 MB por defecto, lo cual rechazaba fotos de celular. Se subió a 10 MB en `next.config.ts` (`experimental.serverActions.bodySizeLimit`). Si algún archivo sigue sin subir, revisar esto primero.

## Lo que se deja para después (NO hacer todavía)

- Login / usuarios / permisos por colaborador (Isaac lo quiere, pero se platica aparte antes de construirlo).
- Estudio de mercado, predicción de ventas, comparación "cómo me fue vs. lo esperado".
- Detección de oportunidades / qué productos traer.
- **Módulo 2 (Stock/Inventario)**: Isaac ya pidió que, al marcar un contenedor como "Recibido", se genere inventario automático. Es el arranque natural del módulo de stock — antes de construirlo hay que platicar con Isaac: ¿el stock se guarda por SKU? ¿qué pasa si el mismo producto viene en varios contenedores? ¿qué costo se guarda al entrar a stock? No meterlo de colado en cambios chicos de Pedidos/Contenedores.
- Ventas, conexión con Mercado Libre / Amazon MX.
- Migrar el histórico de contenedores anteriores al 10 (Isaac los borró del Excel por pesado; se agregarán después cuando el sistema esté listo).

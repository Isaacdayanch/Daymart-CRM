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

### Navegación general

- **`/` es un dashboard de bienvenida**, no la lista de contenedores. Muestra "Bienvenido a Daymart CRM", valor de inventario (Stock) y saldo en Finanzas (dueño) o productos sugeridos para reordenar (operadora), y accesos rápidos a Contenedores/Stock/Finanzas. Sin número de contenedores — a Isaac no le sirve ese dato ahí.
- **La lista de contenedores vive en `/contenedores`** (antes era la home). El botón "+ Nuevo contenedor" está ahí mismo, no en el menú.
- **Header minimalista en todas las pantallas**: logo a la izquierda, menú ☰ a la derecha, nada de links de texto sueltos ("Stock", "Volver a la lista", etc.) — toda la navegación entre secciones pasa por el menú.
- **Menú ☰ solo con las secciones raíz**: Finanzas (dueño, hasta arriba), Contenedores, Stock, Usuarios (dueño). Lo que es específico de una sección vive DENTRO de ella, no en el menú: "Nuevo contenedor" y "Papelera" están dentro de Contenedores, "Dar salida" está dentro de las pestañas de Stock.

### Stack elegido (aprobado por Isaac — "si va")

| Pieza | Qué es | Por qué |
|---|---|---|
| **Next.js** | Motor de la app web | Estándar de la industria, responsive automático (compu y celular) |
| **Supabase** | Base de datos (PostgreSQL) + login + almacenamiento de imágenes | Gratis para empezar, datos 100% exportables, formato estándar (Postgres) |
| **Vercel** | Hosting — donde "vive" la app en internet | Gratis para empezar, acceso vía link desde cualquier navegador, sin instalar nada |

**Principio de portabilidad:** todo el código vive en GitHub (propiedad de Isaac). La base de datos es PostgreSQL estándar, exportable en cualquier momento. Ninguna pieza es propietaria/cerrada — si aparece mejor tecnología, se puede migrar sin perder nada.

### Marca

Logo de Daymart en `src/components/logo.tsx` — solo texto ("Daymart" + tag "CRM" al lado, misma tipografía), sin ícono (Isaac pidió quitar la figura de casita que se había recreado al inicio). Aparece en el encabezado de todas las pantallas (incluidas las que se imprimen). Tipografía: Baloo 2 (Google Font, redondeada), cargada en `src/app/layout.tsx`. Nota histórica: Isaac mandó la imagen del logo real por el chat, pero en este ambiente remoto las imágenes pegadas ahí no llegan como archivo al disco — solo se pueden ver, no guardar. Si algún día consigue el archivo original y lo sube como archivo (no pegado en el chat), se puede retomar la idea del ícono con el diseño real.

**Header de inicio**: minimalista, tipo Apple — sticky con blur, solo el logo a la izquierda y un menú ☰ a la derecha. "Nuevo contenedor", "Stock" y "Papelera" viven dentro del menú desplegable (`src/app/menu-mas.tsx`), no como botones sueltos.

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

## Módulo 2 (en construcción): Stock / Inventario

Fuente de referencia: Excel "Stock y Envíos Daymart", hojas Stock/Entradas/Salidas. Se dejaron fuera del alcance: "Etiquetas" (herramienta de impresión de códigos para Mercado Libre, no es inventario), "Cotización" (lista de ideas de compra futura, no es stock real), "Temporadas" (Isaac pidió explícitamente dejarla para el futuro bloque de análisis), y el tablero de finanzas personales que estaba mezclado en columnas sueltas de la hoja Stock.

### Decisiones tomadas

1. **Bodegas**: tabla propia, empieza con "Bodega Principal" pero se pueden agregar más en `/stock/bodegas`. Cada movimiento de stock queda ligado a una bodega.
2. **Un solo libro de movimientos** (`movimientos_stock`, tipo ENTRADA o SALIDA) en vez de tablas separadas de entradas/salidas — más fácil de auditar todo junto. El stock actual y el valor de inventario NUNCA se guardan a mano, siempre se calculan sumando/restando este libro.
3. **Entrada automática al recibir un contenedor**: elegir "Recibido en bodega" en el estado ya no es un clic — abre `/contenedores/[id]/recibir`, donde Isaac confirma cuánto llegó de verdad de cada producto (por defecto, lo mismo que se pidió). Al confirmar: se generan movimientos de ENTRADA con el costo real por pieza (recalculado con las cantidades reales, para que el CBM/flete/aduana se reparta sobre lo que de verdad viajó), se ajusta `productos.cantidad` a lo real, y se marca `contenedores.stock_generado_en` para no duplicar si se vuelve a tocar el estado.
4. **Mercancía pendiente en China**: si algo no llegó completo, la diferencia se guarda en `pendientes_china` (con todos los datos del producto, si ya está pagada, y de qué contenedor viene). Se ve en `/stock/pendientes`. Al armar un contenedor futuro, en "Agregar producto" hay un selector "¿es mercancía pendiente de China?" que precarga esos datos; al guardar, el pendiente se cierra (o se reduce si solo se consolidó una parte).
5. **Costo de inventario**: cada SKU tiene un costo promedio ponderado (de todas sus entradas históricas). Valor de inventario = stock actual × costo promedio. En el contenedor, una vez recibido, se muestra una tarjeta comparando el costo total del contenedor contra el valor que realmente entró a stock — si no cuadra, es señal de que falta un abono o hay mercancía pendiente sin registrar.
6. **Reórdenes por rotación real**: cada SKU calcula su rotación diaria (salidas de los últimos 90 días ÷ 90) y su punto de reorden = rotación × "tiempo de espera" (días que tarda en llegar un pedido nuevo, configurable en `/stock/configuracion`, empieza en 60 días). Se marca "sugerido reordenar" cuando el stock actual cae a ese punto o menos.
7. **Salidas**: pantalla propia en `/stock/salidas` (sin login todavía, cualquiera con acceso puede registrar). Isaac arma una lista de líneas (producto, cantidad, categoría, notas) y las registra todas juntas de un clic — no una por una. Categorías tomadas de su Excel: Full (con color de etiqueta libre — Isaac organiza sus Full por color: verde, morado, blanco, azul, naranja...), Piezas (venta directa en bodega que recoge Mercado Envíos), Paquetería (venta fuera de ML, se manda por FedEx/etc.), Muestra, Ajuste (se resta, como las anteriores) y **Devolución** — caso especial: en vez de restar, SUMA la cantidad de vuelta al stock (es mercancía que regresa), guardada internamente como un movimiento `AJUSTE` positivo con el costo promedio actual del SKU. La "firma" de salida con encargado, permisos y auditoría se deja pendiente hasta que Isaac delegue esa tarea a alguien (ver abajo): requiere login real primero. El selector de producto (`selector-producto.tsx`) es un desplegable propio (no un `<select>` nativo, que no puede mostrar imágenes) — muestra la foto de cada producto en la lista y tiene buscador, para identificarlos rápido a simple vista.
8. **Stock en Full** (lo que Mercado Libre tiene en sus centros de distribución) se deja para el Módulo 3, cuando se conecte la API de Mercado Libre — ahí se podrá reconciliar automáticamente contra lo que salió de bodega.
16. **Fecha de recepción editable**: al recibir un contenedor (no al editar una recepción ya hecha), hay un campo de fecha con hoy por defecto pero editable — pensado para cargar contenedores históricos (13, 12, 11, 10) con su fecha real. Esa fecha se usa para el historial de estados del contenedor Y para `creado_en` de las entradas de stock generadas, así el inventario y sus fechas quedan consistentes con la realidad, no con "hoy".
9. **Cajas**: cada movimiento guarda las piezas por caja del producto en ese momento; el resumen de stock muestra piezas primero y cajas después (columna discreta, no compite con la cifra principal). Se calcula, no se guarda a mano.
10. **Hoja de revisión de inventario** (`/stock/imprimir`): imprimible, sin precios ni costos — solo foto, SKU, producto, piezas y cajas según el sistema, más una columna en blanco para anotar el conteo físico. Pensada para auditar bodega a mano.
14. **Fotos en Stock**: cada movimiento guarda también la foto del producto (igual patrón que piezas por caja — se toma la más reciente de ENTRADA/AJUSTE). Se ve en el listado de `/stock` y en la hoja imprimible.
15. **Foto en "Agregar stock manual"**: se puede subir una foto directo ahí (mismo componente `CampoImagen` que usan los productos de contenedor, mismo bucket `productos` de Storage) — pensado para mercancía que nunca llegó en un contenedor formal y por eso no tiene foto en el catálogo.
17. **Bug corregido — texto "borroso"/gris en formularios**: la plantilla original de Next.js traía un modo oscuro automático (`@media prefers-color-scheme: dark`) que cambiaba el color del texto a gris claro cuando el celular/compu de Isaac estaba en modo oscuro — pero las tarjetas siguen siendo blancas siempre (la app no tiene diseño oscuro), así que el texto quedaba gris clarito sobre blanco, casi ilegible. Se quitó ese bloque de `globals.css`: el texto ahora es siempre oscuro, sin importar el modo del sistema.
18. **Bug corregido — fecha de recepción no editable después de la primera vez**: el campo de fecha solo aparecía al recibir un contenedor por primera vez, no en "Editar recepción". Ahora aparece siempre, precargada con la fecha que ya tenía guardada; si Isaac la cambia, se actualiza en los tres lugares donde queda registrada (`contenedores.stock_generado_en`, el historial de estados, y `creado_en` de las entradas de stock de ese contenedor).
19. **Componentes de UI propios en vez de los nativos del sistema operativo**: Isaac pidió que los desplegables y el calendario se vean "bonitos, tipo Apple", no como los del navegador/celular. Se construyeron tres componentes reutilizables en `src/components/`:
    - `Selector`: reemplaza `<select>`. Panel flotante redondeado con sombra, funciona "sin controlar" (como un select normal, con `defaultValue` + `name`, manda el valor con un input oculto).
    - `CampoSugerencias`: reemplaza `<input list="...">` (datalist nativo). Campo de texto libre con panel de sugerencias propio, filtrable.
    - `CampoFecha`: reemplaza `<input type="date">`. Calendario propio (mes/año navegable, grid de días), sin depender del picker del sistema operativo.
    Ya no queda ningún `<select>`, `<input type="date">` ni `datalist` nativo en toda la app — todos pasan por estos tres componentes.
22. **Orden del formulario "Agregar producto"**: primero el selector de restock (con foto de cada producto en la lista), luego los campos normales (con foto propia), y hasta abajo — dentro de un `<details>` colapsado, discreto — la pregunta "¿es mercancía pendiente de China?". Antes esa pregunta iba primero y en una caja amarilla grande, y Isaac dijo que le estorbaba al llenar un producto normal (el caso más común).
23. **Fecha de pago en abonos de mercancía**: al agregar un abono (en "Nuevo contenedor" y dentro de un contenedor ya creado) se captura la fecha de pago (hoy por defecto, editable). Los abonos ya guardados también se pueden corregir de fecha: se le da clic a la fecha en la lista y aparece el campo para cambiarla (`actualizarFechaAbono`). La columna `fecha` en `pagos_mercancia` ya existía desde el inicio pero no se usaba en la interfaz.
24. **Bug corregido — "Valor que entró a stock" en $0**: el costo por pieza que entra a stock se calcula al momento de recibir el contenedor, con el flete/aduana/abonos que haya capturados EN ESE MOMENTO. Si Isaac llena esos gastos después de recibir (algo normal — la mercancía suele llegar antes de que se terminen de pagar/capturar los abonos), el costo que ya quedó guardado en las entradas de stock se quedaba congelado en 0 y nunca se refrescaba. Ahora `recalcularCostoEntradasContenedor` se dispara solo cada vez que se guarda el contenedor (flete/aduana/otros gastos) o se agrega/quita un abono — vuelve a calcular el costo por pieza de las entradas ya existentes (sin duplicar ni mover cantidades) con los datos actuales. También hay un botón manual "Recalcular costo →" en la tarjeta de reconciliación del contenedor, por si Isaac quiere forzarlo.
25. **Bug corregido — "Recalcular costo" no encontraba el movimiento a actualizar**: la primera versión buscaba el movimiento de stock a corregir por SKU, pero si Isaac editaba el SKU de un producto DESPUÉS de recibir el contenedor (algo que sí hace), el movimiento guardado tenía el SKU viejo y la búsqueda no encontraba nada — no daba error, simplemente no actualizaba nada, en silencio. Se agregó `producto_id` a `movimientos_stock` (columna real, migración 0013) que se guarda desde que se crea el movimiento (`confirmarRecepcion`, `editarRecepcion`) y ya no depende del SKU. Para movimientos viejos sin `producto_id` (los que ya tenía Isaac cargados), la función busca por SKU como respaldo y de una vez les rellena el `producto_id`. El botón "Recalcular costo →" ahora también dice cuántos productos sí actualizó (o el error real), en vez de un mensaje mudo de "listo".
26. **Bug de raíz corregido — la recepción podía "funcionar" sin guardar nada de stock**: `confirmarRecepcion`, `editarRecepcion` y `agregarStockManual` insertaban en `movimientos_stock` sin revisar si el insert había fallado. Si fallaba (por lo que fuera), el contenedor de todos modos se marcaba "Recibido en bodega" con fecha y todo, pero el libro de movimientos se quedaba vacío para ese contenedor — exactamente lo que le pasó a Isaac con los contenedores 12 y 13 (el 14 sí se guardó bien). Ahora:
    - Los tres insertan y SÍ revisan el error; si falla, no se marca el contenedor como recibido y se muestra el error en la propia pantalla de recepción (`?error=` en `/recibir`), en vez de fingir que quedó bien.
    - "Recalcular costo →" ahora también repara el pasado: si un contenedor ya está "Recibido en bodega" pero no tiene NINGUNA entrada de stock guardada, genera las entradas de cero con los productos, costos y bodega (la primera activa) actuales, y avisa "No tenía ninguna entrada guardada — se generaron X de Y de cero." Isaac lo usó para reparar los contenedores 12 y 13.
27. **"Explicar diferencia" con mercancía pagada en China**: Isaac se dio cuenta de que a veces la diferencia entre el costo del contenedor y el valor que entró a stock no es un error — es mercancía de ese contenedor que se quedó pendiente en China pero YA se pagó (sale en `/stock/pendientes`, marcada "Pagada"). Junto al botón manual "+ Explicar esta diferencia" ahora hay uno nuevo, "Fue mercancía pagada en China →" (`calcularPendienteChinaPagado` en `contenedores/[id]/actions.ts`, cálculo en `src/lib/calculos-pendientes.ts`): busca los pendientes de ESE contenedor con `pagado = true` y `estado = 'PENDIENTE'`, calcula su valor con la misma fórmula de costo por pieza que un producto normal (CBM repartido + precio USD al tipo de cambio promedio de mercancía), y prellena el monto y la nota del ajuste — Isaac revisa y le da "Guardar" para confirmarlo, nunca se guarda solo.
20. **Sugerencias de fábrica/proveedor/categoría**: `src/lib/catalogo-proveedores.ts` junta las fábricas, proveedores y categorías que Isaac ya ha usado (a nivel contenedor y a nivel producto) para sugerirlas con `CampoSugerencias` al capturar un contenedor o producto nuevo — normalmente se repiten mucho. El campo "Proveedor principal" (fábrica + proveedor) ahora también existe en "Nuevo contenedor" (antes solo se podía poner editando el contenedor ya creado).
21. **Categoría se recuerda entre productos del mismo contenedor**: al agregar un producto nuevo (no restock, no pendiente de China), la categoría se precarga con la del último producto ya agregado a ese contenedor — casi siempre un contenedor trae puros productos de la misma categoría.
11. **Categorías de salida**: se tomaron tal cual del Excel de Isaac (hoja Salidas, columna "Lugar"): Full, Paquetería, Piezas, Muestra, Devolución, Ajuste. Es un select, no texto libre.
12. **Editar recepción**: si Isaac hace un conteo físico y algo no cuadra con lo que ya se recibió, puede volver a `/contenedores/[id]/recibir` (botón "Editar recepción" en la tarjeta de reconciliación) y corregir cantidades. Esto NO crea entradas nuevas — genera un movimiento de tipo `AJUSTE` con la diferencia (puede ser positiva o negativa), para no duplicar stock. Los ajustes no cuentan como salida real, así que no ensucian el cálculo de rotación/reorden. Por ahora esta capacidad es solo para Isaac — cuando haya más usuarios, se restringe con permisos.
13. **Agregar stock manual** (`/stock/agregar`): para cargar de una vez el inventario de contenedores anteriores al 10 (u otro stock existente) sin tener que recrear el contenedor completo en el sistema. Crea una ENTRADA directa (sin contenedor asociado) con SKU, cantidad, costo por pieza y una nota libre.

## Módulo 3 (en construcción): Finanzas

Solo lo ve Isaac como dueño — bloqueado por completo para el rol "operadora" (ni lectura), igual que `/contenedores/nuevo`, `/usuarios` y `/papelera`.

**Ya construido**: Cuentas (`/finanzas/cuentas`), Categorías (`/finanzas/categorias`), el libro de Movimientos con su panel de registro como pantalla principal (`/finanzas`, historial completo en `/finanzas/movimientos`), y Facturas pendientes de pagar (`/finanzas/facturas`). **Pendiente**: préstamos/prestamistas, proveedores financieros, pagos a China ligados a Finanzas, crédito de contenedor, y el estado de cuenta unificado de deudas.

### Cómo fluye el dinero en Daymart (contexto de Isaac)

1. **Entra**: capital externo, sobre todo préstamos (ej. alguien le presta $1,000,000 MXN). El negocio queda debiendo eso. El dinero entra a una cuenta de Isaac.
2. **Sale a China**: para pagar proveedores chinos, Isaac le da el dinero a un intermediario/proveedor financiero en México que transfiere a China y cobra una comisión (fee, normalmente %).
3. **Trabaja en China**: esos pagos corresponden a contenedores específicos — esto ya existe (`pagos_mercancia`, ver Módulo 1).
4. **Gastos en México**: recibir mercancía, nómina, bodega, logística, etc.
5. **Sueldo**: Isaac retira sueldo (semanal o cuando quiera) y quiere ver cuánto lleva retirado acumulado.
6. **Segunda etapa (NO construir todavía)**: las ventas van a caer en Mercado Pago, de ahí se pasan al banco, y se cotejará ventas vs. costos vs. ganancia con la API de Mercado Libre (Módulo 4). El diseño de Finanzas debe dejar espacio para esto (ej. que se pueda agregar una cuenta tipo Mercado Pago más adelante) sin tener que rehacer nada — pero no se construye ahora.

### Decisiones de diseño (para cuando se apruebe y se construya)

1. **Cero doble captura de pagos a China — Contenedores y Finanzas son UN SOLO dato, no dos que se tienen que parecer**: un pago a China (abono de mercancía) o un abono de crédito de aduana se captura en un solo lugar (la pestaña de Abonos del contenedor, que ya existe) y desde ahí aparece automáticamente como salida de dinero en Finanzas. No hay una pantalla aparte para "registrar el mismo pago otra vez". Mecanismo técnico para que esto no se desincronice (aprendido de los bugs de Stock de este mismo proyecto, donde datos "copiados" se desalinearon):
   - Cada abono (`pagos_mercancia` o el nuevo `pagos_aduana`) guarda el id del movimiento de Finanzas que generó (`movimiento_financiero_id`), no al revés — así siempre hay una relación directa, nunca dos registros sueltos que "deberían" coincidir.
   - Si Isaac corrige el monto, la fecha o la cuenta de un abono ya guardado, el movimiento de Finanzas ligado se actualiza en la misma operación (no se crea uno nuevo suelto).
   - Si Isaac borra un abono, su movimiento de Finanzas se borra con él.
   - Todo insert/update se revisa por error explícitamente (mismo principio que `insertarMovimientosStock` en Stock) — si falla guardar el lado de Finanzas, NO se guarda el abono tampoco (todo o nada), para no repetir el bug de contenedores que se marcaban "recibidos" sin que su stock se hubiera guardado de verdad.
   Mismo mecanismo para el crédito de aduana (ver abajo).
2. **Cuentas** (`cuentas_financieras`): catálogo abierto (Isaac agrega las que quiera) — empieza con "Caja de efectivo" y "Banco BBVA". El saldo de cada cuenta NUNCA se guarda a mano: se calcula sumando/restando su libro de movimientos (mismo principio que el stock).
3. **Un solo libro de movimientos** (`movimientos_financieros`), igual que el stock tiene un solo `movimientos_stock`: cada entrada/salida/transferencia es una fila, con cuenta, monto, fecha, categoría, contraparte y notas. Una transferencia entre cuentas propias (ej. efectivo → banco) es un solo movimiento con cuenta origen y cuenta destino — resta de una y suma a la otra, y NO cuenta como ingreso ni gasto en los reportes (se excluye de esas sumas a propósito).
4. **Categorías** (`categorias_financieras`): catálogo corto y editable por Isaac. Arranca con: Nómina, Bodega, Logística, Importación, Comisiones, Sueldo. "Sueldo" es una categoría fija para poder ver fácil cuánto ha retirado Isaac en total.
5. **Préstamos, súper detallados** (`prestamistas` + `prestamos` + sus abonos): Isaac quiere llevar cada préstamo por persona, no solo un total suelto.
   - **Prestamistas**: catálogo de personas/empresas que le prestan dinero (nombre, notas). Cada prestamista tiene su propia ficha (`/finanzas/prestamistas/[id]`) donde Isaac ve TODOS los préstamos que le ha hecho esa persona a lo largo del tiempo, cuánto le ha prestado en total, cuánto le ha pagado, y cuánto le debe todavía — para saber "a quién le debo y cuánto le he pagado" de un vistazo.
   - **Préstamos**: cada uno ligado a un prestamista, con monto, a qué cuenta entró, fecha, y una **fecha de pago opcional** (puede no tener — deuda abierta sin compromiso de fecha).
   - **Sin interés por ahora**: Isaac no ha tenido ningún préstamo con interés todavía. Cuando le den uno, lo agregamos como una opción más (ej. una tasa opcional por préstamo) — no se construye ahora, pero el diseño no debe estorbar para agregarlo después.
   - **Moneda por préstamo**: cada préstamo se captura en pesos O en dólares (Isaac elige al crearlo) — puede tener préstamos de ambos tipos al mismo tiempo. El abono de un préstamo siempre es en la misma moneda que el préstamo. En todos lados donde se totalice (ficha del prestamista, `/finanzas/deudas`, dashboard) se muestran **dos totales separados** — total en pesos y total en dólares — nunca se convierte ni se mezcla uno con otro.
   - El saldo de cada préstamo NUNCA se edita a mano: se calcula (monto − suma de sus abonos), igual que todo lo demás en el sistema. Cada abono que Isaac registra también genera su movimiento de salida en Finanzas automáticamente (una sola captura).
6. **Estado de cuenta unificado de deudas** (`/finanzas/deudas`): una sola pantalla donde Isaac ve TODO lo que debe en un solo vistazo, sin importar si es un préstamo de una persona o crédito de un proveedor/aduana de algún contenedor — pensada para cuando tenga dinero disponible y necesite decidir a quién pagarle primero:
   - Lista de todo lo que debe: préstamos vivos (por prestamista), crédito de proveedores pendiente (por contenedor), crédito de aduana pendiente (por contenedor).
   - Cada renglón muestra a quién/qué le debe, cuánto, en qué moneda, y su fecha límite (o "sin fecha" si no tiene) — ordenado por fecha límite más próxima primero, para priorizar pagos.
   - Totales separados: cuánto debe en pesos (préstamos + crédito de aduana pendiente) y cuánto debe en dólares (crédito de proveedores pendiente).
7. **Proveedores financieros** (`proveedores_financieros`): catálogo con nombre y fee habitual (%, solo de referencia — ver punto 8 de cómo se captura realmente). Al elegir uno en un pago a China, el % sugerido se autorrellena, pero se puede corregir con el mecanismo del punto 8.
8. **Comisiones — un solo mecanismo, para cualquier movimiento**: en vez de que la comisión solo exista para pagos a China, cualquier movimiento de Finanzas (entrada o salida, ligado o no a un contenedor — pagos a China, pagarle a un proveedor en México, más adelante recibir dinero de ventas) tiene un campo opcional **"¿Tuvo comisión esta transacción?"**. Isaac no captura el % directo: captura el monto que entregó y el monto neto que realmente se movió (ej. pesos que dio vs. dólares que confirmó el agente que mandó), y el sistema calcula solo el % — ese % calculado se guarda como el fee de referencia de ese proveedor financiero para la próxima vez. Si se llena, se crea automático un gasto aparte en categoría "Comisiones", ligado a ese movimiento (una sola captura, mismo mecanismo del punto 1 — nunca dos registros sueltos).
   - **¿La comisión se mete al costo del producto o se queda como gasto?** Depende de si el movimiento está ligado a un contenedor: si es un pago a China o un pago de crédito de aduana, la comisión se SUMA al costo de ese contenedor (junto con flete/aduana/otros gastos) — es un costo directo de traer la mercancía, igual que el flete. Si el movimiento no está ligado a ningún contenedor (pagar a un proveedor de México, comisión al recibir dinero de ventas), es un gasto normal de Finanzas que no toca el costo de ningún producto.
   - **El préstamo (o su interés, cuando lo tenga) nunca se mete al costo del producto** — es un gasto financiero aparte (de cómo se consiguió el dinero, no de traer la mercancía), aunque ese dinero se haya usado para pagar a China. Solo la comisión de la transferencia en sí se absorbe al costo, no el préstamo.
9. **Pagos a China = pagos_mercancia, extendido**: la tabla de abonos de mercancía que ya existe (Módulo 1) se le agregan campos de Finanzas (cuenta de la que salió, proveedor financiero, comisión vía el mecanismo del punto 8). Al marcar un abono como "Pagado", se genera su movimiento de salida en Finanzas (y el de la comisión, si aplica) automáticamente — sigue siendo la misma pantalla de Abonos del contenedor que Isaac ya conoce, no una nueva.
10. **Crédito de contenedor, es una opción dentro de cada contenedor (NUEVO, pendiente de construir)** — los dos casos reales de Isaac:
    - **Crédito del proveedor chino, en dólares**: la fábrica le da crédito, lo va abonando cuando puede. Reutiliza el mismo mecanismo que "Abonos de mercancía" (que ya soporta marcar un abono como "Pendiente", no solo "Pagado" — solo le falta la fecha límite).
    - **Crédito del agente aduanal, en pesos, con fecha a 60 días típicamente**: el agente aduanal paga el fideicomiso de aduanas por adelantado, e Isaac se lo debe pagar después (ej. a 60 días) — es crédito nuevo, no existe hoy (`aduana_pesos` en el contenedor es solo un total, sin abonos ni fecha de pago). Se construye con el mismo patrón que mercancía (lista de abonos, cada uno "Pagado"/"Pendiente" con su fecha límite), pero en pesos y sin tipo de cambio.
    Ambos son opcionales por contenedor (no todo contenedor tiene crédito) y ambos se reflejan en Finanzas como deuda viva, separado por moneda: "debo en pesos" (préstamos en pesos + crédito de aduana pendiente) y "debo en dólares" (préstamos en dólares + crédito de proveedores pendiente).
11. **Dashboard financiero** (`/finanzas`): saldo por cuenta, gasto por categoría, comisiones pagadas acumuladas, sueldo retirado acumulado, deuda viva (separada en pesos y dólares), y cuánto dinero se ha mandado por contenedor. El detalle línea por línea de la deuda vive en `/finanzas/deudas` (punto 6).
12. **`/finanzas` (panel principal) es primero que nada el registro, no un resumen pasivo** — así lo pidió Isaac, como cualquier app de finanzas seria: arriba hay 3 botones — "Agregar dinero" (entrada, ej. recibir efectivo o depósito en banco), "Mandar dinero" (salida — NO se llama "gastar", Isaac lo aclaró: son pagos/transferencias que manda, no necesariamente un gasto propio) y "Mover entre mis cuentas" (transferencia). Abajo, saldos por cuenta y los últimos movimientos, con el historial completo en `/finanzas/movimientos`.
13. **La comisión opcional aplica a salidas Y a transferencias** — Isaac aclaró que a veces mover dinero entre sus propias cuentas también genera comisión (ej. cargo del banco). Mismo mecanismo en ambos casos: el monto neto (lo que de verdad le llega al destinatario o a la cuenta destino) se guarda en el movimiento principal, y la diferencia se separa sola como gasto en "Comisiones" desde la misma cuenta de origen — nunca se infla ni se duplica. (Para entradas, el tema de comisiones se resuelve cuando se conecte ventas — Isaac ya lo sabe.)
14. **Facturas pendientes de pagar** (`facturas_pendientes`, pantalla `/finanzas/facturas`): seguimiento de cuentas por pagar sueltas (proveedores de México, servicios, etc. — no son un préstamo ni un pago a China). Isaac captura proveedor, concepto, monto/moneda, fecha de la factura y fecha límite opcional. Se ven ordenadas por fecha límite más próxima primero. Al marcarse "Pagada" (eligiendo de qué cuenta sale y la categoría), se genera su movimiento de salida en Finanzas en la misma operación — la factura guarda el id de ese movimiento (mismo mecanismo de "una sola captura" que todo el módulo). Solo se puede borrar una factura que sigue sin pagar.

## Respaldo en Google Sheets (Finanzas + Stock + Contenedores)

Isaac quería un respaldo fuera del sistema por si algún día falla. Mecanismo: `/api/respaldo` (`src/app/api/respaldo/route.ts`) es una ruta de solo lectura protegida por una clave secreta (`RESPALDO_SECRET`, variable de entorno en Vercel) — **no usa login normal** porque quien la llama es un script de Google, no un navegador con sesión. Por eso mismo usa la **service role key** de Supabase (`SUPABASE_SERVICE_ROLE_KEY`, nunca la anon key) del lado del servidor — la anon key es pública (viaja en el navegador) así que jamás se le puede dar permiso directo a estas tablas sensibles; la única puerta de entrada es la clave secreta de esta ruta. `src/proxy.ts` excluye `/api/respaldo` del login normal a propósito (`RUTAS_PUBLICAS`).

Devuelve tres bloques en JSON: `finanzas` (libro completo de movimientos_financieros con nombres de cuenta/categoría ya resueltos), `stock` (resumen actual por SKU — cantidad, cajas, costo y valor, no el historial completo), `contenedores` (lista con estado, booking, fábrica/proveedor y costo). Un script de Google Apps Script (que vive en la hoja de Isaac, fuera de este repo) llama esta ruta cada cierto tiempo (Isaac eligió que sea todo: Finanzas + Stock + Contenedores) y escribe cada bloque en su propia pestaña de la hoja.

## Módulo Research (en pruebas — NO publicado todavía en la página real)

Solo dueño (trae números de costo/margen). Isaac lo diseñó platicándolo primero conmigo, con su técnica real de buscar productos en Mercado Libre antes de decidir si vale la pena importarlos. Por su propia petición, este módulo se construyó primero en una rama de trabajo aparte y una vista previa de Vercel, sin tocar `main`/su página real, hasta que él lo pruebe con un producto de verdad y confirme que los números cuadran.

**Flujo:**
1. Isaac pega el link de un producto de Mercado Libre (`/research/nueva`) y le da "Traer datos" → el sistema jala foto, nombre, precio de referencia, categoría y ventas del anuncio, usando la API pública de Mercado Libre (`api.mercadolibre.com/items/{id}`, sin necesidad de sesión) — el ID se saca del link con una expresión regular (`src/lib/mercadolibre.ts`). Si falla (producto no encontrado, sin conexión), no truena la pantalla — se queda todo editable a mano.
2. Isaac llena lo que solo él sabe: precio de compra en dólares, tipo de cambio estimado, piezas por caja, medidas de la caja de importación, y su $/CBM estimado (de su experiencia, no exacto) → de ahí sale el costo estimado por pieza, con la MISMA fórmula que ya usa Contenedores (`src/lib/calculos-research.ts`, reutiliza `cbmProducto` de `src/lib/calculos.ts`).
3. **Ojo con esta distinción**: las medidas de "la caja" para el costo de importación (arriba) NO son las mismas que las del "paquete individual" (como le llega a UN cliente de Mercado Libre) que se usan para calcular el costo de envío de Mercado Libre — son dos cajas distintas (una trae varias piezas para importar, la otra es una sola pieza para el cliente final). El formulario pide las dos por separado.
4. Con las medidas del paquete individual, se calcula el peso volumétrico (`(largo × ancho × alto cm) ÷ 5000`, fórmula oficial de Mercado Libre) y se compara contra el peso físico real si Isaac lo puso (siempre se usa el mayor de los dos) → se busca en la tabla oficial de costos de envío de Mercado Libre México (`src/lib/costos-envio-ml.ts`, la tabla completa con reputación verde que mandó Isaac) → se propone el costo de envío, **editable a mano**.
5. La comisión de Mercado Libre por ahora se captura A MANO (Isaac la saca del simulador real: https://vendedores.mercadolibre.com.mx/simulador-de-costos) — no se automatizó porque no se pudo probar en vivo la API de comisiones de Mercado Libre antes de construir esto (limitación del entorno de trabajo, no de Mercado Libre) — queda pendiente para automatizar después, una vez confirmado que los números del resto ya cuadran.
6. Con todo eso: margen estimado en vivo (pesos y %), antes de guardar.
7. Botón "Guardar como borrador" (`research_productos`, migración 0020) — guarda todo como foto del momento, no se recalcula solo después.
8. Desde un borrador, "Convertir en producto →" — mismo patrón que "agregarProducto" de Contenedores, crea el producto real en el contenedor que Isaac elija (con categoría/fábrica/proveedor/cantidad que confirme ahí) y marca el borrador como `CONVERTIDO`, ligado a ese contenedor.

**Pendiente después de que Isaac lo pruebe**: automatizar la comisión de Mercado Libre (hay una API pública `sites/MLM/listing_prices` que probablemente la calcula, sin confirmar en vivo todavía); permitir editar un borrador ya guardado (hoy solo se puede guardar, descartar o quitar).

## Lo que se deja para después (NO hacer todavía)

- Login / usuarios / permisos por colaborador. Isaac ya confirmó que por ahora solo él usa el sistema, así que no hace falta todavía — pero es un REQUISITO antes de construir la "firma" de salidas con encargado: sin cuentas de usuario no hay forma de saber quién hizo qué, y eso es justo lo que Isaac pidió para prevenir robo hormiga. Cuando llegue el momento: dos roles (Administrador / Encargado de bodega), cada salida queda con usuario+fecha, no se puede editar/borrar después (solo cancelar con motivo), y una pantalla de auditoría para que Isaac revise al encargado.
- Estudio de mercado, predicción de ventas, comparación "cómo me fue vs. lo esperado", temporadas por categoría.
- Ventas, conexión con Mercado Libre / Amazon MX (Módulo 3) — incluye sincronizar "Stock en Full" y reconciliar salidas contra lo que ML confirmó recibido.
- Migrar el histórico de contenedores anteriores al 10 (Isaac los borró del Excel por pesado; se agregarán después cuando el sistema esté listo).

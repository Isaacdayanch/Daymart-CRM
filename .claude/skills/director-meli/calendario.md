# Calendario del Director Meli

Hora del mensaje de la mañana: **8:25 am, Ciudad de México**, todos los días (tarea programada "Director Meli · Daymart" en la cuenta de Isaac; se cambia desde los ajustes de tareas programadas de Claude).

Nivel: **1 = proponer** (Isaac aprueba por lista antes de ejecutar) · **2 = hacer y avisar** (se ejecuta y se reporta). Solo Isaac sube una tarea a nivel 2.

| Cuándo | Área | Qué se hace | Nivel |
|---|---|---|---|
| Diario | Relámpago | Lista para el día +2, dos horarios (skill `ofertas-relampago-daymart`) | 1 |
| Diario | Full | Qué se acaba en ≤ 14 días y cuánto mandar; qué pedir a China si no hay en bodega | 1 |
| Diario | Avisos | Contenedores por llegar, SKUs sin ligar, preguntas sin responder, vencimientos de Finanzas, ventas de ayer | — |
| Lunes | Publicidad | Revisión de 7 días de Product Ads (skill `publicidad-meli-daymart`) | 1 |
| Martes | Promociones CRM | Publicaciones abajo del margen mínimo o sin ventas en 14 días → propuesta de descuento del vendedor | 1 |
| Jueves | Publicaciones | Productos con stock sin publicación activa, o publicaciones flojas → qué crear o rediseñar (máx. 3) | 1 |
| Cuando un contenedor pasa a "Recibido en bodega" | Promociones + Publicaciones | Lo que llegó: ¿tiene publicación? ¿precio con margen? ¿va a Full? | 1 |
| Cuando `ligas_pendientes` > 0 | Ligas | Va primero en Avisos: sin liga no hay costo ni margen | — |

## Cambios al calendario

- 2026-10-20: calendario inicial (propuesto por el programador, aprobado por Isaac con "va").

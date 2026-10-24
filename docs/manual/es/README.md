# Edición de lectura en español

El [manual técnico de referencia](../README.md) permanece en inglés. Esta edición
en español conserva los 26 capítulos, los seis apéndices y el registro de
limitaciones de la revisión original, con una redacción adaptada a lectura en PDF.

- Fuente editable: [lectura.md](lectura.md).
- PDF: [manual-nabla-engine-es.pdf](../../../output/pdf/manual-nabla-engine-es.pdf).
- Generador: [build-manual-pdf.py](../../../scripts/build-manual-pdf.py).

## Regenerar

Desde la raíz del repositorio, con Python, ReportLab y las fuentes Arial y Consolas
de Windows disponibles:

```sh
python scripts/build-manual-pdf.py
```

En el entorno de Codex se puede utilizar el Python empaquetado. El script obtiene
el inventario de API de `package.json` e incorpora los cuatro ejemplos existentes
de `examples/manual/`. No traduce automáticamente cambios posteriores de la prosa
inglesa: revisa primero el capítulo equivalente y actualiza `lectura.md`.

La generación escribe el PDF y un registro `.provenance.json` con versión y hashes
de las fuentes. El registro `.validation.json` corresponde a la comprobación de la
edición entregada, no se actualiza automáticamente al regenerar. Después de un
cambio, renderiza de nuevo el PDF con Poppler y revisa páginas, tablas, ejemplos,
índice y marcadores antes de sustituir la edición validada.

## Validación de esta edición

El 23 de octubre de 2026 se verificaron 46 páginas, los 26 capítulos, 68 enlaces
internos del índice, metadatos de idioma español, texto dentro de los márgenes y
ausencia de caracteres de sustitución detectados. Se renderizaron y revisaron
visualmente las páginas; se ajustaron saltos y agrupación de los ejemplos completos.
No se modificó ni volvió a certificar el comportamiento del motor por generar el PDF.

La revisión de mantenimiento del mismo día actualizó el contrato de terreno y el
registro de correcciones. Se regeneraron las 46 páginas, se comprobaron límites de
texto y navegación y se revisaron visualmente la maquetación y las páginas modificadas.
El hash del PDF revisado queda en el registro `.validation.json`.

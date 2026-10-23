/**
 * First module of every game page: puts the engine stylesheet (src/ui/styles, see
 * docs/ui-theme.md) at the top of <head>, before the page's own modules run. Host token
 * overrides placed later in <head> win by order.
 */
import { installEngineStyles } from '../src/ui/styles.js'

installEngineStyles(document)

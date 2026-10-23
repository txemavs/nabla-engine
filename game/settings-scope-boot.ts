/** First import of the game entry: scope saved settings to the play mode before anything reads them. */
import { installSettingsScope } from '@nabla/engine/runtime/settings-scope'

installSettingsScope()

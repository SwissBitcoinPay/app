Pod::Spec.new do |s|
  s.name           = 'ThemeCrossfade'
  s.version        = '1.0.0'
  s.summary        = "A change of theme as a crossfade"
  s.description    = "A still of the app's window held over it while the theme changes, then faded out"
  s.author         = 'sattle.me'
  s.homepage       = 'https://github.com/sattleme/app'
  s.platforms      = {
    :ios => '18.0'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end

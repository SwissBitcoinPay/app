Pod::Spec.new do |s|
  s.name           = 'RelativeDay'
  s.version        = '1.0.0'
  s.summary        = "The device's own words for today and yesterday"
  s.description    = "The device's own words for today and yesterday, in a given locale (DateFormatter's relative formatting)"
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

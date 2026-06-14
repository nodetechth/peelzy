Pod::Spec.new do |s|
  s.name           = 'PeelzySubjectLift'
  s.version        = '0.1.0'
  s.summary        = 'Apple Subject Lift native module for Peelzy.'
  s.description    = 'Uses VisionKit to lift subjects from photos and write transparent PNGs.'
  s.author         = 'Peelzy'
  s.homepage       = 'https://peelzy.local'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end

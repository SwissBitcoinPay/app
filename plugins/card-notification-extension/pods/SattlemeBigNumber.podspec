# Swift-BigInt 2.4.0 (mkrd/Swift-BigInt, MIT), which the Breez Spark SDK's Swift bindings import as
# `BigNumber` (their Package.swift: from 2.4.0). Pinned to the commit of its tag v2.4.0.
Pod::Spec.new do |s|
  s.name                  = "SattlemeBigNumber"
  s.module_name           = "BigNumber"
  s.version               = "2.4.0"
  s.summary               = "Swift-BigInt 2.4.0 (BigNumber)"
  s.homepage              = "https://github.com/mkrd/Swift-BigInt"
  s.license               = { :type => "MIT" }
  s.authors               = "mkrd"
  s.source                = {
    :git => "https://github.com/mkrd/Swift-BigInt.git",
    :commit => "7e2117797cd1b608303cc2da1a3a2263cc4e7727"
  }
  s.ios.deployment_target = "13.0"
  s.swift_version         = "5.0"
  s.source_files          = "Sources/BigNumber/*.swift"
end

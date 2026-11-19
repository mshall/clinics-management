# Contract extension: location. Amazon Location Service map + route calculator for the field-visit package
# (@kiorly/field-visit: travel buffers, route ordering, home-slot search; KX-08 C4 "AWS adds Location (maps)").
#
# REAL-PROVIDER COUNTERPART of the mock-default adapter. The application talks to an adapter interface with
# MODE=mock|real (KIORLY_PROVIDER_MODE, default mock): the mock returns deterministic fake routes/matrices and
# creates nothing in AWS; `real` calls these resources through the App Runner instance role. Therefore this module
# is OFF by default and is only enabled in the dedicated "Provider go-live" pass (staging first). Nothing here
# is applied until the founder approves.
#
# Privacy: callers must send coarse coordinates / district centroids only. Never send a patient's exact address
# or any name to the provider (KX-08 geostamp/address rules, PDPL). Resources are regional: they live in the
# stack's data cell region (eu-central-1 for frankfurt).

locals {
  on = var.enabled
}

resource "aws_location_map" "this" {
  count    = local.on ? 1 : 0
  map_name = "${var.name}-map"

  configuration {
    style = var.map_style
  }

  description = "Field-visit route view for ${var.name} (real-provider counterpart of the mock maps adapter)"
  tags        = var.tags
}

resource "aws_location_route_calculator" "this" {
  count           = local.on ? 1 : 0
  calculator_name = "${var.name}-routes"
  data_source     = var.route_data_source
  description     = "Travel-time / route ordering for ${var.name} (real-provider counterpart of the mock routing adapter)"
  tags            = var.tags
}

# Least privilege for the API role: calculate routes + render the map. No place search, no trackers, no geofences
# (live tracking of staff is out of scope; geostamps are coarse and stored by the app, KX-08).
data "aws_iam_policy_document" "use" {
  count = local.on ? 1 : 0

  statement {
    sid       = "CalculateRoutes"
    actions   = ["geo:CalculateRoute", "geo:CalculateRouteMatrix"]
    resources = [aws_location_route_calculator.this[0].calculator_arn]
  }
  statement {
    sid       = "RenderMap"
    actions   = ["geo:GetMapStyleDescriptor", "geo:GetMapGlyphs", "geo:GetMapSprites", "geo:GetMapTile"]
    resources = [aws_location_map.this[0].map_arn]
  }
}

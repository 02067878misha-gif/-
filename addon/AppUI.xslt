<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:corel="Corel Framework Data" exclude-result-prefixes="corel">
  <corel:uiconfig><corel:applicationInfo userConfiguration="true"/></corel:uiconfig>
  <xsl:template match="@*|node()">
    <xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy>
  </xsl:template>
  <xsl:template match="/uiConfig/items">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()"/>
      <itemData guid="1f783856-93e9-483a-ab35-a3288f114177" type="wpfhost"
        hostedType="Addons\StrataDraw\StrataDraw.dll,StrataDraw.ToolPanel" enable="true"/>
      <itemData guid="aa1d3465-12bf-41b0-bb52-649c67cef6e5" type="checkButton"
        userCaption="Strata Draw" enable="true" check="*Docker('31a95ea4-d384-4cb7-924f-cbddac9aad33')"/>
    </xsl:copy>
  </xsl:template>
  <xsl:template match="/uiConfig/dockers">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()"/>
      <dockerData guid="31a95ea4-d384-4cb7-924f-cbddac9aad33"
        userCaption="Strata Draw" wantReturn="true" focusStyle="noThrow">
        <container><item dock="fill" guidRef="1f783856-93e9-483a-ab35-a3288f114177"/></container>
      </dockerData>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
